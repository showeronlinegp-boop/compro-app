#!/usr/bin/env node
'use strict';

/**
 * migrate-sku-ids.js
 * Rellena la columna sku_id para los productos que todavía no la tienen.
 * Usa la API de variaciones de VTEX: /api/catalog_system/pub/products/variations/{productId}
 *
 * Uso:
 *   node backend/migrate-sku-ids.js          → migra todos los supers
 *   node backend/migrate-sku-ids.js vea      → migra solo vea
 */

const db        = require('./db');
const { SUPERS } = require('../vtex-crawler');

const CONCURRENCY = 8;
const THROTTLE_MS = 150;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function fetchSkuId(baseUrl, productId) {
  try {
    const res = await fetch(
      `${baseUrl}/api/catalog_system/pub/products/variations/${productId}`,
      {
        headers: { 'User-Agent': UA, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const firstSku = data?.skus?.[0]?.sku;
    return firstSku ? String(firstSku) : null;
  } catch {
    return null;
  }
}

async function migrateSuper(superKey) {
  const cfg = SUPERS[superKey];
  if (!cfg) {
    console.error(`Súper desconocido: ${superKey}`);
    return;
  }

  const products = db.prepare(
    `SELECT id, product_id FROM products WHERE super = ? AND (sku_id IS NULL OR sku_id = '') ORDER BY id`
  ).all(superKey);

  if (!products.length) {
    console.log(`[${superKey}] Todos los productos ya tienen sku_id.`);
    return;
  }

  console.log(`[${superKey}] ${products.length} productos a migrar…`);

  const updateStmt = db.prepare(`UPDATE products SET sku_id = ? WHERE id = ?`);
  let done = 0, updated = 0, failed = 0;

  for (let i = 0; i < products.length; i += CONCURRENCY) {
    const batch = products.slice(i, i + CONCURRENCY);

    const results = await Promise.all(
      batch.map(p =>
        fetchSkuId(cfg.baseUrl, p.product_id).then(skuId => ({ p, skuId }))
      )
    );

    for (const { p, skuId } of results) {
      done++;
      if (skuId) {
        updateStmt.run([skuId, p.id]);
        updated++;
      } else {
        failed++;
      }
    }

    if (i + CONCURRENCY < products.length) {
      await new Promise(res => setTimeout(res, THROTTLE_MS));
    }

    if (done % 500 === 0 || done === products.length) {
      console.log(`[${superKey}] ${done}/${products.length} — ok: ${updated}, sin sku: ${failed}`);
    }
  }

  console.log(`[${superKey}] Migración completa. ${updated} actualizados, ${failed} sin sku.`);
}

async function main() {
  const arg = process.argv[2];
  const keys = arg ? [arg] : Object.keys(SUPERS);

  for (const key of keys) {
    await migrateSuper(key);
  }

  console.log('\nListo.');
  process.exit(0);
}

main().catch(e => { console.error('Error fatal:', e.message); process.exit(1); });
