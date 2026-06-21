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
 *
 * Parallelization slices:
 *   Slice 2 — probe phase uses runPool (bounded concurrent probes, no per-request sleep).
 *   Slice 3 — pages within a partition fetched in parallel via runPool.
 *   Slice 4 — partitions processed concurrently via runPool; LOCAL seen maps merged
 *              sequentially in plan order after the pool resolves (output-identical).
 */

import type { PrismaClient } from '@prisma/client';
import { SUPERS, resolveCrawlConfig } from '../../config/supers.js';
import { CRAWLER_IS_SAFE_MAX, CRAWLER_PAGE_SIZE } from '../../config/throttles.js';
import { getCatalogTree, searchPage } from '../../infrastructure/vtex/is-client.js';
import { buildNormalizer } from '../../infrastructure/vtex/normalizer.js';
import { fetchWithRetry } from '../../shared/fetch.js';
import { runPool } from '../../shared/pool.js';
import type {
  CrawlConcurrency,
  NormalizedCrawlItem,
  Partition,
  SuperKey,
  SyncLog,
} from '../../shared/types.js';
import { mergeItems } from '../domain/dedup.js';
import { planPartitions } from '../domain/partition.js';
import type { TreeNode } from '../domain/partition.js';
import { isRunning, markDone, markRunning } from './sync-state.js';
import { makeSyncRepo } from './sync.repo.js';

export interface CrawlerService {
  syncSuper: (
    superKey: string,
    regionId?: string | null,
  ) => Promise<{ super: string; count: number }>;
  syncAll: (
    regionIds?: Record<string, string | null>,
  ) => Promise<Array<{ super: string; count?: number; error?: string }>>;
  getSyncStatus: () => Promise<SyncLog[]>;
  isRunning: (superKey: string) => boolean;
}

export interface CrawlerServiceDeps {
  prisma: PrismaClient;
  /** Optional: called after a successful syncSuper to trigger enrichment. */
  enrichSuper?: (superKey: string) => Promise<unknown>;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Empty-page retry (silent-drop guard)
// ---------------------------------------------------------------------------

/** Result of one IS page fetch, with a flag marking a likely silent drop. */
export interface PageFetchResult {
  products: unknown[];
  total: number;
  /** True when the page should have had products but stayed empty/errored. */
  dropped: boolean;
}

/**
 * Fetch one IS page, retrying when the API returns HTTP 200 with an EMPTY
 * product list even though its own `recordsFiltered` (total) says products
 * exist. Carrefour's IS-API intermittently returns 200-empty under crawl load;
 * `fetchWithRetry` only retries thrown errors, so without this a throttled page
 * silently drops ~PAGE_SIZE products — and `deleteStaleForSuper` then removes
 * them (observed: a product present for other supers vanished from carrefour
 * while its same-category siblings survived the same run).
 *
 * A page is `dropped` only on a genuine inconsistency (empty body with total>0,
 * or errors that outlast the retries). A facet that truly has zero products
 * (total===0) is NOT a drop, so legitimate stale-deletion still works.
 *
 * `fetchPage` is injected for testability; the caller wraps it with
 * `fetchWithRetry` so thrown/5xx errors are already retried inside one attempt.
 */
export async function fetchPageWithEmptyRetry(
  fetchPage: (pageNum: number) => Promise<{ products: unknown[]; total: number }>,
  partitionName: string,
  pageNum: number,
  opts: { maxEmptyRetries?: number; emptyRetryDelayMs?: number } = {},
): Promise<PageFetchResult> {
  const maxEmptyRetries = opts.maxEmptyRetries ?? 3;
  const delayMs = opts.emptyRetryDelayMs ?? 600;

  for (let attempt = 0; ; attempt++) {
    let result: { products: unknown[]; total: number };
    try {
      result = await fetchPage(pageNum);
    } catch (err) {
      if (attempt >= maxEmptyRetries) {
        console.error(
          `  ⚠  ${partitionName} page ${pageNum} (error after retries):`,
          (err as Error).message,
        );
        return { products: [], total: 0, dropped: true };
      }
      await sleep(delayMs * (attempt + 1));
      continue;
    }

    // Got products, or the facet genuinely has zero products → accept as-is.
    if (result.products.length > 0 || result.total === 0) {
      return { products: result.products, total: result.total, dropped: false };
    }

    // 200-empty but total > 0 → throttled / inconsistent. Retry, then give up.
    if (attempt >= maxEmptyRetries) {
      console.warn(
        `  ⚠  ${partitionName} page ${pageNum}: empty body with total=${result.total} ` +
          `after ${maxEmptyRetries} retries — counted as a dropped page`,
      );
      return { products: [], total: result.total, dropped: true };
    }
    await sleep(delayMs * (attempt + 1));
  }
}

// ---------------------------------------------------------------------------
// Slice 2 — buildProbeCounts (parallel probes via runPool)
// ---------------------------------------------------------------------------

/**
 * Build the probe-counts map for a given super config.
 * Hits the IS API once per department (and per sub-category when needed).
 *
 * Slice 2: replaced the sequential dept for-loop with runPool(tree, probeConc).
 * Nested sub-category probes also run in a bounded pool.
 * Per-request sleep removed — pacing comes from concurrency limit + fetchWithRetry backoff.
 * Counts Map is built from pool results in INPUT ORDER (plan-stable).
 */
async function buildProbeCounts(
  superKey: string,
  cfg: { baseUrl: string; promoSeller?: string },
  tree: TreeNode[],
  crawlCfg: CrawlConcurrency,
  regionId?: string | null,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  let probes = 0;
  let errors = 0;

  console.log(
    `[plan:${superKey}] Probing ${tree.length} departments (IS API, conc=${crawlCfg.probeConc})...`,
  );

  // Each dept worker returns its path→total entries in a flat array.
  type ProbeEntry = [path: string, total: number];

  const deptResults = await runPool(
    tree,
    crawlCfg.probeConc,
    async (dept): Promise<ProbeEntry[]> => {
      const path1 = `category-1/${dept.name}`;
      let total1 = 0;
      try {
        const result = await fetchWithRetry(() => searchPage(cfg, path1, 1, regionId), {
          maxRetries: 4,
        });
        total1 = result.total;
      } catch (err) {
        errors++;
        console.warn(`[plan:${superKey}] probe FAILED "${dept.name}": ${(err as Error).message}`);
      }
      probes++;
      console.log(`[plan:${superKey}] (${probes}) "${dept.name}" → ${total1} products`);

      const entries: ProbeEntry[] = [[path1, total1]];

      // If dept > IS_SAFE_MAX and has children, probe sub-categories too
      if (total1 > CRAWLER_IS_SAFE_MAX && (dept.children ?? []).length > 0) {
        const subResults = await runPool(
          dept.children,
          crawlCfg.probeConc,
          async (sub): Promise<ProbeEntry> => {
            const path2 = `category-1/${dept.name}/category-2/${sub.name}`;
            let total2 = 0;
            try {
              const result = await fetchWithRetry(() => searchPage(cfg, path2, 1, regionId));
              total2 = result.total;
            } catch (err) {
              errors++;
              console.warn(
                `[plan:${superKey}] probe FAILED "${dept.name} > ${sub.name}": ${(err as Error).message}`,
              );
            }
            probes++;
            return [path2, total2];
          },
        );
        entries.push(...subResults);
      }

      return entries;
    },
  );

  // Rebuild counts Map from pool results in input order (plan-stable)
  for (const deptEntries of deptResults) {
    for (const [path, total] of deptEntries) {
      counts.set(path, total);
    }
  }

  console.log(`[plan:${superKey}] Done probing: ${probes} probes, ${errors} errors.`);
  return counts;
}

// ---------------------------------------------------------------------------
// Slice 3 — crawlOnePartitionPages (page concurrency within a partition)
// ---------------------------------------------------------------------------

/**
 * Fetch all pages of a partition concurrently and return merged items.
 *
 * Slice 3: page 1 is fetched first (to learn total); pages 2..N are fetched
 * in parallel via runPool(pageConc). Results are merged in ascending page
 * order to preserve mergeItems determinism.
 *
 * Per-page sleep removed — pacing via concurrency + fetchWithRetry backoff.
 */
async function crawlPartitionPages(
  cfg: { baseUrl: string; promoSeller?: string },
  partition: Partition,
  normalize: (p: unknown) => NormalizedCrawlItem | null,
  crawlCfg: CrawlConcurrency,
  regionId?: string | null,
): Promise<{ normalizedPages: NormalizedCrawlItem[][]; fetched: number; incomplete: boolean }> {
  const pages = Math.ceil(Math.min(partition.total, CRAWLER_IS_SAFE_MAX) / CRAWLER_PAGE_SIZE);
  let fetched = 0;
  let incomplete = false;

  console.log(`  -> crawl: "${partition.name}" (~${partition.total} prods, ${pages} pages)`);

  const fetchPage = (pageNum: number) =>
    fetchWithRetry(() => searchPage(cfg, partition.path, pageNum, regionId));

  // Fetch page 1 first (learn total, short-circuit if empty)
  const page1 = await fetchPageWithEmptyRetry(fetchPage, partition.name, 1);

  if (page1.dropped) {
    // Couldn't confirm page 1 (throttled-empty or persistent error). Treat the
    // whole partition as incomplete so its existing rows are NOT stale-deleted.
    return { normalizedPages: [], fetched: 0, incomplete: true };
  }

  if (!page1.products.length) {
    // Facet genuinely has no products (total===0) — nothing to crawl, not a drop.
    return { normalizedPages: [], fetched: 0, incomplete: false };
  }

  // Normalize page 1 items
  const page1Items: NormalizedCrawlItem[] = [];
  for (const p of page1.products) {
    fetched++;
    const norm = normalize(p);
    if (norm) page1Items.push(norm);
  }

  const normalizedPages: NormalizedCrawlItem[][] = [page1Items];

  // Fetch remaining pages in parallel if needed
  if (pages > 1) {
    const pageNumbers = Array.from({ length: pages - 1 }, (_, i) => i + 2); // [2, 3, ..., pages]

    const remainingPages = await runPool(
      pageNumbers,
      crawlCfg.pageConc,
      async (pageNum): Promise<{ items: NormalizedCrawlItem[]; dropped: boolean }> => {
        const res = await fetchPageWithEmptyRetry(fetchPage, partition.name, pageNum);
        if (res.dropped) return { items: [], dropped: true };

        const items: NormalizedCrawlItem[] = [];
        for (const p of res.products) {
          fetched++;
          const norm = normalize(p);
          if (norm) items.push(norm);
        }
        return { items, dropped: false };
      },
    );

    // Pages are already in ascending order (runPool index-aligns results)
    for (const r of remainingPages) {
      normalizedPages.push(r.items);
      if (r.dropped) incomplete = true;
    }
  }

  return { normalizedPages, fetched, incomplete };
}

// ---------------------------------------------------------------------------
// Slice 4 — crawlOnePartition (local seen map, no shared state writes)
// ---------------------------------------------------------------------------

/**
 * Crawl a single partition into a LOCAL seen map.
 *
 * Slice 4: does NOT write to any shared state or call repo.
 * Returns localSeen and touchedIds for the sequential fold phase.
 */
async function crawlOnePartition(
  cfg: { baseUrl: string; promoSeller?: string },
  partition: Partition,
  normalize: (p: unknown) => NormalizedCrawlItem | null,
  crawlCfg: CrawlConcurrency,
  regionId?: string | null,
): Promise<{
  localSeen: Map<string, NormalizedCrawlItem>;
  touchedIds: Set<string>;
  incomplete: boolean;
}> {
  const localSeen = new Map<string, NormalizedCrawlItem>();
  const touchedIds = new Set<string>();

  const { normalizedPages, incomplete } = await crawlPartitionPages(
    cfg,
    partition,
    normalize,
    crawlCfg,
    regionId,
  );

  // Merge in ascending page order (page 1 first, then 2..N by index)
  // This preserves the exact sequential merge sequence for dedup determinism.
  for (const pageItems of normalizedPages) {
    if (pageItems.length > 0) {
      mergeItems(pageItems, localSeen, touchedIds, partition);
    }
  }

  return { localSeen, touchedIds, incomplete };
}

// ---------------------------------------------------------------------------
// makeCrawlerService
// ---------------------------------------------------------------------------

export function makeCrawlerService(deps: CrawlerServiceDeps): CrawlerService {
  const repo = makeSyncRepo(deps.prisma);

  async function syncSuper(
    superKey: string,
    regionId?: string | null,
  ): Promise<{ super: string; count: number }> {
    if (isRunning(superKey)) throw new Error(`Sync de ${superKey} ya en curso`);

    const cfg = SUPERS[superKey as SuperKey];
    if (!cfg) throw new Error(`Super desconocido: ${superKey}`);

    // Resolve concurrency config: static defaults < env vars < per-super overrides
    const crawlCfg = resolveCrawlConfig(superKey);

    markRunning(superKey);

    const logId = await repo.insertSyncLog(superKey);

    try {
      console.log(
        `[sync:${superKey}] Building partition plan (IS API)${regionId ? ' [region set]' : ''}...`,
      );
      const tree = await fetchWithRetry(() => getCatalogTree(cfg, 2));
      const probeCounts = await buildProbeCounts(
        superKey,
        cfg,
        tree as TreeNode[],
        crawlCfg,
        regionId,
      );
      const partitions = planPartitions(tree as TreeNode[], probeCounts);

      console.log(`[sync:${superKey}] ${partitions.length} partitions`);
      await repo.updateSyncProgress(0, partitions.length, 0, logId);

      const normalize = buildNormalizer(cfg);
      // Canonical seen map — accumulated sequentially in plan order during fold
      const seen = new Map<string, NormalizedCrawlItem>();

      // -----------------------------------------------------------------------
      // Slice 4: run all partitions concurrently via runPool.
      // Each worker builds a LOCAL seen map — no shared state writes.
      // -----------------------------------------------------------------------
      const partitionResults = await runPool(
        partitions,
        crawlCfg.partitionConc,
        async (
          partition,
        ): Promise<{
          localSeen: Map<string, NormalizedCrawlItem>;
          touchedIds: Set<string>;
          incomplete: boolean;
        }> => {
          try {
            return await crawlOnePartition(
              cfg,
              partition,
              normalize as (p: unknown) => NormalizedCrawlItem | null,
              crawlCfg,
              regionId,
            );
          } catch (err) {
            // Error tolerance: log context, return empty maps — does NOT abort sync.
            // Marked incomplete so stale-delete is skipped (this partition's rows
            // would otherwise be wrongly deleted as stale).
            console.error(
              `[sync:${superKey}] partition "${partition.name}" failed — skipping:`,
              (err as Error).message,
            );
            return { localSeen: new Map(), touchedIds: new Set(), incomplete: true };
          }
        },
      );

      // -----------------------------------------------------------------------
      // Sequential post-pool fold IN PLAN ORDER (results index == partitions index).
      // Merging in plan order reconstructs the exact sequential merge sequence,
      // making output byte-identical to the sequential baseline.
      //
      // NOTE: DB flushes happen after the parallel fetch wave rather than
      // interleaved with fetches — timing change only, no contract change.
      // -----------------------------------------------------------------------
      let crawlComplete = true;
      for (const [i, { localSeen, touchedIds, incomplete }] of partitionResults.entries()) {
        // biome-ignore lint/style/noNonNullAssertion: index i is always valid (partitionResults.length === partitions.length)
        const partition = partitions[i]!;
        if (incomplete) crawlComplete = false;

        // Merge local seen into canonical seen (same mergeItems semantics, plan order)
        for (const [productId, item] of localSeen) {
          const existing = seen.get(productId);
          if (existing) {
            for (const c of item.category_paths) {
              if (!existing.category_paths.includes(c)) existing.category_paths.push(c);
            }
          } else {
            seen.set(productId, item);
          }
        }

        // Flush only touched products (same as legacy flushToDb with touchedIds)
        const touchedItems = [...touchedIds]
          .map((id) => seen.get(id))
          .filter((item): item is NormalizedCrawlItem => item !== undefined);
        await repo.upsertProducts(superKey, touchedItems);

        await repo.updateSyncProgress(i + 1, partitions.length, seen.size, logId);
        console.log(
          `[sync:${superKey}] ${i + 1}/${partitions.length} "${partition.name}" — ${seen.size} products saved`,
        );

        // Inter-partition courtesy delay (politeness knob; not correctness)
        await sleep(crawlCfg.throttleMs);
      }

      // Delete stale rows from previous syncs — ONLY when the crawl was complete.
      // If any page was dropped (throttled-empty) or a partition failed, skipping
      // the delete keeps valid-but-unseen products instead of wrongly purging them;
      // they get pruned on the next clean run.
      if (crawlComplete) {
        const deleted = await repo.deleteStaleForSuper(superKey, logId);
        if (deleted > 0) {
          console.log(`[sync:${superKey}] Deleted ${deleted} stale products from previous sync`);
        }
      } else {
        console.warn(
          `[sync:${superKey}] Crawl incomplete (dropped pages or failed partitions) — SKIPPING stale-delete to avoid purging valid products`,
        );
      }

      await repo.finishSyncLog(seen.size, logId);
      console.log(`[sync:${superKey}] Done. ${seen.size} products.`);

      // Fire-and-forget enrich trigger (Slice 6 swaps legacy enricher for TS enricher)
      if (deps.enrichSuper) {
        deps
          .enrichSuper(superKey)
          .catch((err: Error) => console.error(`[enrich:${superKey}] Error:`, err.message));
      }

      return { super: superKey, count: seen.size };
    } catch (err) {
      await repo.failSyncLog((err as Error).message, logId);
      console.error(`[sync:${superKey}] Error:`, (err as Error).message);
      throw err;
    } finally {
      markDone(superKey);
    }
  }

  async function syncAll(regionIds?: Record<string, string | null>) {
    const results: Array<{ super: string; count?: number; error?: string }> = [];
    for (const key of Object.keys(SUPERS)) {
      try {
        results.push(await syncSuper(key, regionIds?.[key] ?? null));
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
