/**
 * sync.ts — Standalone crawl/sync runner (no Express server).
 *
 * Wires a PrismaClient + crawler service directly so you can run a sync for
 * one super (or all) in the foreground and watch the [plan:*] / [sync:*]
 * logs live — useful for diagnosing a slow or blocked super (e.g. VEA
 * rate-limiting).
 *
 * By default only the CRAWL runs. Pass --enrich to also run price enrichment
 * (search-promotions for vea, JSON-LD scraping for the others) after each crawl.
 * Pass --enrich-only to SKIP the crawl and just enrich what's already in the DB.
 *
 * DATABASE_URL env var is optional; defaults to the local dev Postgres.
 *
 * Usage:
 *   npx tsx scripts/sync.ts vea               # crawl one super
 *   npx tsx scripts/sync.ts vea --enrich      # crawl + enrich one super
 *   npx tsx scripts/sync.ts vea --enrich-only # enrich only (no re-crawl)
 *   npx tsx scripts/sync.ts all --enrich      # crawl + enrich every super
 *   npm run sync -- vea --enrich-only         # via package.json script
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { SUPERS } from '../src/config/supers.js';
import { makeCrawlerService } from '../src/crawler/infrastructure/crawler.service.js';
import { makeEnricher } from '../src/enrichment/infrastructure/enricher.service.js';

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

  const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://compro:compro@localhost:5433/compro';
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  const crawler = makeCrawlerService({ prisma });
  const enricher = withEnrich ? makeEnricher(prisma) : null;

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
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
