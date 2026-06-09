/**
 * sync.ts — Standalone crawl/sync runner (no Express server).
 *
 * Wires the DB + crawler service directly so you can run a sync for one super
 * (or all) in the foreground and watch the [plan:*] / [sync:*] logs live —
 * useful for diagnosing a slow or blocked super (e.g. VEA rate-limiting).
 *
 * Enrichment is NOT triggered here (keeps the output focused on the crawl).
 *
 * Usage:
 *   npx tsx scripts/sync.ts vea          # sync one super
 *   npx tsx scripts/sync.ts all          # sync every super, sequentially
 *   npm run sync -- vea                  # via package.json script
 *
 * NOTE: stop the dev server first (or at least don't sync from the UI at the
 * same time) — better-sqlite3 allows only one writer, so concurrent syncs on
 * the same DB file will collide.
 */

import { DB_PATH } from '../src/config/env.js';
import { SUPERS } from '../src/config/supers.js';
import { makeCrawlerService } from '../src/crawler/infrastructure/crawler.service.js';
import { createDb } from '../src/infrastructure/db/client.js';
import { runMigrations } from '../src/infrastructure/db/migrations.js';

const VALID_KEYS = Object.keys(SUPERS);

function usage(): never {
  console.error('Usage: tsx scripts/sync.ts <super|all>');
  console.error(`  <super>: one of ${VALID_KEYS.join(', ')}`);
  console.error('  all    : sync every super sequentially');
  process.exit(1);
}

async function main(): Promise<void> {
  const target = process.argv[2];
  if (!target) usage();
  if (target !== 'all' && !VALID_KEYS.includes(target)) {
    console.error(`Unknown super: "${target}"`);
    usage();
  }

  const db = createDb(DB_PATH);
  runMigrations(db);

  // No enrichSuper — this runner only crawls.
  const crawler = makeCrawlerService({ db });

  const startedAt = Date.now();
  console.log(`\n=== Sync runner — target: ${target} ===\n`);

  try {
    if (target === 'all') {
      const results = await crawler.syncAll();
      console.log('\n=== syncAll complete ===');
      console.table(results);
    } else {
      const result = await crawler.syncSuper(target);
      console.log(`\n=== Sync complete: ${result.super} → ${result.count} products ===`);
    }
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
