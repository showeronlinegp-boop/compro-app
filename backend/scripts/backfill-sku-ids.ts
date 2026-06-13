#!/usr/bin/env tsx
/**
 * backfill-sku-ids.ts — Fills sku_id for products that are still missing it.
 *
 * Port of backend/migrate-sku-ids.js.
 * Uses fetchSkuId from catalog-client (single canonical import — dedup enforced).
 *
 * Usage:
 *   npx tsx backend/scripts/backfill-sku-ids.ts          → migrates all supers
 *   npx tsx backend/scripts/backfill-sku-ids.ts vea      → migrates only vea
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { SUPERS } from '../src/config/supers.js';
import { MIGRATE_CONCURRENCY, MIGRATE_THROTTLE_MS } from '../src/config/throttles.js';
import { fetchSkuId } from '../src/infrastructure/vtex/catalog-client.js';
import type { SuperKey } from '../src/shared/types.js';

// ─── DB setup ─────────────────────────────────────────────────────────────────

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://compro:compro@localhost:5433/compro';
const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

// ─── Migration logic ──────────────────────────────────────────────────────────

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface ProductRow {
  id: number;
  product_id: string;
}

async function migrateSuper(superKey: string): Promise<void> {
  const cfg = SUPERS[superKey as SuperKey];
  if (!cfg) {
    console.error(`Unknown super: ${superKey}`);
    return;
  }

  const products = await prisma.products.findMany({
    where: {
      super: superKey,
      OR: [{ sku_id: null }, { sku_id: '' }],
    },
    select: { id: true, product_id: true },
    orderBy: { id: 'asc' },
  });

  if (!products.length) {
    console.log(`[${superKey}] All products already have sku_id.`);
    return;
  }

  console.log(`[${superKey}] ${products.length} products to migrate...`);

  let done = 0;
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < products.length; i += MIGRATE_CONCURRENCY) {
    const batch = (products as ProductRow[]).slice(i, i + MIGRATE_CONCURRENCY);

    const results = await Promise.all(
      batch.map((p) => fetchSkuId(cfg, p.product_id).then((skuId) => ({ p, skuId }))),
    );

    for (const { p, skuId } of results) {
      done++;
      if (skuId) {
        await prisma.products.update({
          where: { id: p.id },
          data: { sku_id: skuId },
        });
        updated++;
      } else {
        failed++;
      }
    }

    if (i + MIGRATE_CONCURRENCY < products.length) {
      await sleep(MIGRATE_THROTTLE_MS);
    }

    if (done % 500 === 0 || done === products.length) {
      console.log(
        `[${superKey}] ${done}/${products.length} — ok: ${updated}, without sku: ${failed}`,
      );
    }
  }

  console.log(`[${superKey}] Migration complete. ${updated} updated, ${failed} without sku.`);
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  const keys = arg ? [arg] : Object.keys(SUPERS);

  try {
    for (const key of keys) {
      await migrateSuper(key);
    }
    console.log('\nDone.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: Error) => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
