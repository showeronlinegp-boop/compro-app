/**
 * sync.ts — Standalone crawl/sync runner (no Express server).
 *
 * Wires the DB + crawler service directly so you can run a sync for one super
 * (or all) in the foreground and watch the [plan:*] / [sync:*] logs live —
 * useful for diagnosing a slow or blocked super (e.g. VEA rate-limiting).
 *
 * By default only the CRAWL runs. Pass --enrich to also run price enrichment
 * (search-promotions for vea, JSON-LD scraping for the others) after each crawl.
 * Pass --enrich-only to SKIP the crawl and just enrich what's already in the DB.
 *
 * Usage:
 *   npx tsx scripts/sync.ts vea               # crawl one super
 *   npx tsx scripts/sync.ts vea --enrich      # crawl + enrich one super
 *   npx tsx scripts/sync.ts vea --enrich-only # enrich only (no re-crawl)
 *   npx tsx scripts/sync.ts all --enrich      # crawl + enrich every super
 *   npm run sync -- vea --enrich-only         # via package.json script
 *
 * NOTE: stop the dev server first (or at least don't sync from the UI at the
 * same time) — better-sqlite3 allows only one writer, so concurrent syncs on
 * the same DB file will collide.
 */

import { DB_PATH } from '../src/config/env.js';
import { SUPERS } from '../src/config/supers.js';
import { makeCrawlerService } from '../src/crawler/infrastructure/crawler.service.js';
import { makeEnricher } from '../src/enrichment/infrastructure/enricher.service.js';
import { createDb } from '../src/infrastructure/db/client.js';
import { runMigrations } from '../src/infrastructure/db/migrations.js';

const VALID_KEYS = Object.keys(SUPERS);

function usage(): never {
  console.error('Usage: tsx scripts/sync.ts <super|all> [--enrich | --enrich-only]');
  console.error(`  <super>       : one of ${VALID_KEYS.join(', ')}`);
  console.error('  all           : sync every super sequentially');
  console.error('  --enrich      : also run price enrichment after each crawl');
  console.error('  --enrich-only : skip the crawl, only enrich existing products');
  process.exit(1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const enrichOnly = args.includes('--enrich-only');
  const withEnrich = enrichOnly || args.includes('--enrich');
  const target = args.find((a) => !a.startsWith('--'));

  if (!target) usage();
  if (target !== 'all' && !VALID_KEYS.includes(target)) {
    console.error(`Unknown super: "${target}"`);
    usage();
  }

  const db = createDb(DB_PATH);
  runMigrations(db);

  const crawler = makeCrawlerService({ db });
  const enricher = withEnrich ? makeEnricher(db) : null;

  const keys = target === 'all' ? VALID_KEYS : [target];

  const mode = enrichOnly ? 'enrich-only' : withEnrich ? 'crawl + enrich' : 'crawl';
  const startedAt = Date.now();
  console.log(`\n=== Sync runner — target: ${target} (${mode}) ===\n`);

  try {
    for (const key of keys) {
      if (!enrichOnly) {
        const result = await crawler.syncSuper(key);
        console.log(`[sync:${key}] crawled ${result.count} products`);
      }

      if (enricher) {
        console.log(`[enrich:${key}] starting...`);
        await enricher.enrichSuper(key);
        const st = enricher.getStatus()[key];
        if (st) {
          console.log(
            `[enrich:${key}] done — ${st.updated}/${st.total} products got a promo price`,
          );
        }
      }
    }
    console.log('\n=== Sync complete ===');
  } catch (err) {
    console.error(`\n=== Sync FAILED: ${(err as Error).message} ===`);
    process.exitCode = 1;
  } finally {
    const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`Elapsed: ${secs}s`);
    db.close();
  }
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
