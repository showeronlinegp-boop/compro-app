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

import { SUPERS } from '../src/config/supers.js';
import { MIGRATE_CONCURRENCY, MIGRATE_THROTTLE_MS } from '../src/config/throttles.js';
import { createDb } from '../src/infrastructure/db/client.js';
import { runMigrations } from '../src/infrastructure/db/migrations.js';
import { fetchSkuId } from '../src/infrastructure/vtex/catalog-client.js';
import type { SuperKey } from '../src/shared/types.js';

// ─── DB setup ─────────────────────────────────────────────────────────────────

const DB_PATH = process.env.DB_PATH ?? '../compro.db';
const db = createDb(DB_PATH);
runMigrations(db);

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

  const products = db
    .prepare(
      `SELECT id, product_id FROM products WHERE super = ? AND (sku_id IS NULL OR sku_id = '') ORDER BY id`,
    )
    .all(superKey) as ProductRow[];

  if (!products.length) {
    console.log(`[${superKey}] All products already have sku_id.`);
    return;
  }

  console.log(`[${superKey}] ${products.length} products to migrate...`);

  const updateStmt = db.prepare('UPDATE products SET sku_id = ? WHERE id = ?');
  let done = 0;
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < products.length; i += MIGRATE_CONCURRENCY) {
    const batch = products.slice(i, i + MIGRATE_CONCURRENCY);

    const results = await Promise.all(
      batch.map((p) => fetchSkuId(cfg, p.product_id).then((skuId) => ({ p, skuId }))),
    );

    for (const { p, skuId } of results) {
      done++;
      if (skuId) {
        updateStmt.run(skuId, p.id);
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

  for (const key of keys) {
    await migrateSuper(key);
  }

  console.log('\nDone.');
  process.exit(0);
}

main().catch((e: Error) => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
