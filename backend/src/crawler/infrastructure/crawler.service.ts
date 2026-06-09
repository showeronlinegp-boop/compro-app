/**
 * crawler.service.ts — Crawler service: partition planning + crawl loop + sync orchestration.
 *
 * Merges vtex-crawler.js (getPartitions, crawlPartition) and
 * backend/crawler-service.js (syncSuper, syncAll, concurrent-run guard, stale delete,
 * sync_log on completion, fire-and-forget enrich trigger).
 *
 * Behavior is IDENTICAL to the legacy JS files:
 *   - In-memory running guard (isRunning/markRunning/markDone via sync-state.ts).
 *   - Partition planning via IS API probes (planPartitions in domain layer).
 *   - Per-partition crawl with seen-Map dedup (mergeItems in domain layer).
 *   - Flush touched products to DB after each partition.
 *   - Update sync_log progress after each partition.
 *   - Stale-delete after all partitions complete.
 *   - sync_log finalized with status=ok/error.
 *   - Fire-and-forget enrich trigger (calls legacy enricher for now; Slice 6 swaps it).
 */

import type Database from 'better-sqlite3';
import { SUPERS } from '../../config/supers.js';
import {
  CRAWLER_IS_SAFE_MAX,
  CRAWLER_PAGE_SIZE,
  CRAWLER_THROTTLE_MS,
} from '../../config/throttles.js';
import { getCatalogTree, searchPage } from '../../infrastructure/vtex/is-client.js';
import { buildNormalizer } from '../../infrastructure/vtex/normalizer.js';
import type { NormalizedCrawlItem, Partition, SuperKey } from '../../shared/types.js';
import { mergeItems } from '../domain/dedup.js';
import { planPartitions } from '../domain/partition.js';
import type { TreeNode } from '../domain/partition.js';
import { isRunning, markDone, markRunning } from './sync-state.js';
import { makeSyncRepo } from './sync.repo.js';

export interface CrawlerService {
  syncSuper: (superKey: string) => Promise<{ super: string; count: number }>;
  syncAll: () => Promise<Array<{ super: string; count?: number; error?: string }>>;
  getSyncStatus: () => unknown;
  isRunning: (superKey: string) => boolean;
}

export interface CrawlerServiceDeps {
  db: Database.Database;
  /** Optional: called after a successful syncSuper to trigger enrichment. */
  enrichSuper?: (superKey: string) => Promise<unknown>;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Build the probe-counts map for a given super config.
 * Hits the IS API once per department (and per sub-category when needed).
 * Equivalent to the probeCount() calls inside legacy getPartitions().
 */
async function buildProbeCounts(
  superKey: string,
  cfg: { baseUrl: string; promoSeller?: string },
  tree: TreeNode[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  let probes = 0;
  let errors = 0;

  console.log(`[plan:${superKey}] Probing ${tree.length} departments (IS API)...`);

  for (const dept of tree) {
    const path1 = `category-1/${dept.name}`;
    let total1 = 0;
    try {
      const result = await searchPage(cfg, path1, 1);
      total1 = result.total;
    } catch (err) {
      errors++;
      console.warn(`[plan:${superKey}] probe FAILED "${dept.name}": ${(err as Error).message}`);
    }
    probes++;
    await sleep(CRAWLER_THROTTLE_MS);

    counts.set(path1, total1);
    console.log(`[plan:${superKey}] (${probes}) "${dept.name}" → ${total1} products`);

    // If dept > IS_SAFE_MAX and has children, probe sub-categories too
    if (total1 > CRAWLER_IS_SAFE_MAX && (dept.children ?? []).length > 0) {
      for (const sub of dept.children) {
        const path2 = `category-1/${dept.name}/category-2/${sub.name}`;
        let total2 = 0;
        try {
          const result = await searchPage(cfg, path2, 1);
          total2 = result.total;
        } catch (err) {
          errors++;
          console.warn(
            `[plan:${superKey}] probe FAILED "${dept.name} > ${sub.name}": ${(err as Error).message}`,
          );
        }
        probes++;
        await sleep(CRAWLER_THROTTLE_MS);
        counts.set(path2, total2);
      }
    }
  }

  console.log(`[plan:${superKey}] Done probing: ${probes} probes, ${errors} errors.`);
  return counts;
}

/**
 * Crawl a single partition: fetch all pages up to maxPages, deduplicate via seen Map.
 * Equivalent to legacy crawlPartition().
 */
async function crawlPartition(
  cfg: { baseUrl: string; promoSeller?: string },
  partition: Partition,
  seen: Map<string, NormalizedCrawlItem>,
  normalize: (p: unknown) => NormalizedCrawlItem | null,
): Promise<{ fetched: number; total: number; touchedIds: Set<string> }> {
  const pages = Math.ceil(Math.min(partition.total, CRAWLER_IS_SAFE_MAX) / CRAWLER_PAGE_SIZE);
  let fetched = 0;
  const touchedIds = new Set<string>();

  console.log(`  -> crawl: "${partition.name}" (~${partition.total} prods, ${pages} pages)`);

  for (let page = 1; page <= pages; page++) {
    let result: { products: unknown[]; total: number };
    try {
      result = await searchPage(cfg, partition.path, page);
    } catch (err) {
      console.error(`  ⚠  ${partition.name} page ${page}:`, (err as Error).message);
      break;
    }

    if (!result.products.length) break;

    const normalized: NormalizedCrawlItem[] = [];
    for (const p of result.products) {
      fetched++;
      const norm = normalize(p);
      if (!norm) continue;
      normalized.push(norm);
    }

    mergeItems(normalized, seen, touchedIds, partition);

    if (result.products.length < CRAWLER_PAGE_SIZE) break;
    await sleep(CRAWLER_THROTTLE_MS);
  }

  return { fetched, total: partition.total, touchedIds };
}

export function makeCrawlerService(deps: CrawlerServiceDeps): CrawlerService {
  const repo = makeSyncRepo(deps.db);

  async function syncSuper(superKey: string): Promise<{ super: string; count: number }> {
    if (isRunning(superKey)) throw new Error(`Sync de ${superKey} ya en curso`);

    const cfg = SUPERS[superKey as SuperKey];
    if (!cfg) throw new Error(`Super desconocido: ${superKey}`);

    markRunning(superKey);

    const logId = repo.insertSyncLog(superKey);

    try {
      console.log(`[sync:${superKey}] Building partition plan (IS API)...`);
      const tree = await getCatalogTree(cfg, 2);
      const probeCounts = await buildProbeCounts(superKey, cfg, tree as TreeNode[]);
      const partitions = planPartitions(tree as TreeNode[], probeCounts);

      console.log(`[sync:${superKey}] ${partitions.length} partitions`);
      repo.updateSyncProgress(0, partitions.length, 0, logId);

      const normalize = buildNormalizer(cfg);
      const seen = new Map<string, NormalizedCrawlItem>();

      for (const [i, partition] of partitions.entries()) {
        const { touchedIds } = await crawlPartition(
          cfg,
          partition,
          seen,
          normalize as (p: unknown) => NormalizedCrawlItem | null,
        );

        // Flush only touched products (same as legacy flushToDb with touchedIds)
        const touchedItems = [...touchedIds]
          .map((id) => seen.get(id))
          .filter((item): item is NormalizedCrawlItem => item !== undefined);
        repo.upsertProducts(superKey, touchedItems);

        repo.updateSyncProgress(i + 1, partitions.length, seen.size, logId);
        console.log(
          `[sync:${superKey}] ${i + 1}/${partitions.length} partitions — ${seen.size} products saved`,
        );

        await sleep(CRAWLER_THROTTLE_MS);
      }

      // Delete stale rows from previous syncs
      const deleted = repo.deleteStaleForSuper(superKey, logId);
      if (deleted > 0) {
        console.log(`[sync:${superKey}] Deleted ${deleted} stale products from previous sync`);
      }

      repo.finishSyncLog(seen.size, logId);
      console.log(`[sync:${superKey}] Done. ${seen.size} products.`);

      // Fire-and-forget enrich trigger (Slice 6 swaps legacy enricher for TS enricher)
      if (deps.enrichSuper) {
        deps
          .enrichSuper(superKey)
          .catch((err: Error) => console.error(`[enrich:${superKey}] Error:`, err.message));
      }

      return { super: superKey, count: seen.size };
    } catch (err) {
      repo.failSyncLog((err as Error).message, logId);
      console.error(`[sync:${superKey}] Error:`, (err as Error).message);
      throw err;
    } finally {
      markDone(superKey);
    }
  }

  async function syncAll() {
    const results: Array<{ super: string; count?: number; error?: string }> = [];
    for (const key of Object.keys(SUPERS)) {
      try {
        results.push(await syncSuper(key));
      } catch (err) {
        results.push({ super: key, error: (err as Error).message });
      }
    }
    return results;
  }

  return {
    syncSuper,
    syncAll,
    getSyncStatus: () => repo.getSyncStatus(),
    isRunning,
  };
}
