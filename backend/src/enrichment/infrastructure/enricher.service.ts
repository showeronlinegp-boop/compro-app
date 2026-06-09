/**
 * enricher.service.ts — Price enrichment service.
 *
 * Ports backend/enricher.js enrichSuper, enrichViaPromos, enrichViaHtmlScraping.
 * Strategy A: search-promotions endpoint (supers with promoSeller configured).
 * Strategy B: HTML JSON-LD scraping (all other supers).
 *
 * Concurrency constants match legacy exactly:
 *   ENRICH_CONCURRENCY=15  (HTML scraping parallel requests)
 *   ENRICH_PROMO_CONC=8    (search-promotions parallel requests)
 *   ENRICH_SKU_CONC=10     (SKU-ID variation API parallel requests)
 *   ENRICH_THROTTLE_MS=250 (sleep between batches)
 *   ENRICH_PROMO_BATCH=20  (SKUs per search-promotions POST — hard endpoint limit)
 *
 * fetchSkuId imported from catalog-client (SINGLE canonical source — dedup enforced).
 * DB update SQL matches legacy: UPDATE products SET offer_price=?, discount_pct=? WHERE id=?
 */

import type Database from 'better-sqlite3';
import { SUPERS } from '../../config/supers.js';
import {
  ENRICH_CONCURRENCY,
  ENRICH_PROMO_BATCH,
  ENRICH_PROMO_CONC,
  ENRICH_SKU_CONC,
  ENRICH_THROTTLE_MS,
} from '../../config/throttles.js';
import { fetchSkuId } from '../../infrastructure/vtex/catalog-client.js';
import {
  fetchPromoPrice,
  fetchSearchPromotions,
} from '../../infrastructure/vtex/promotions-client.js';
import type { EnrichStatus, SuperKey } from '../../shared/types.js';
import { effectiveDiscount, offerPrice } from '../domain/discount.js';
import { getStatus, isRunning, setStatus } from './enrich-state.js';

export interface EnrichService {
  enrichSuper: (superKey: string) => Promise<void>;
  getStatus: () => Record<string, EnrichStatus>;
  isRunning: (superKey: string) => boolean;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface ProductEnrichRow {
  id: number;
  product_id: string;
  sku_id: string | null;
  raw_price: number;
  product_url: string | null;
}

// ─── Strategy A: search-promotions (vea / promoSeller) ───────────────────────

async function enrichViaPromos(
  superKey: string,
  cfg: { baseUrl: string; promoSeller: string },
  products: ProductEnrichRow[],
  st: EnrichStatus,
  db: Database.Database,
): Promise<void> {
  const updateSkuStmt = db.prepare('UPDATE products SET sku_id = ? WHERE id = ?');
  const updateStmt = db.prepare(
    'UPDATE products SET offer_price = ?, discount_pct = ? WHERE id = ?',
  );

  // First: fill missing sku_ids in batches (parallel, SKU_CONC at a time)
  const withoutSku = products.filter((p) => !p.sku_id);
  if (withoutSku.length) {
    console.log(`[enrich:${superKey}] Fetching sku_id for ${withoutSku.length} products...`);
    for (let i = 0; i < withoutSku.length; i += ENRICH_SKU_CONC) {
      const chunk = withoutSku.slice(i, i + ENRICH_SKU_CONC);
      const results = await Promise.all(
        chunk.map((p) =>
          fetchSkuId({ baseUrl: cfg.baseUrl }, p.product_id).then((skuId) => ({ p, skuId })),
        ),
      );
      for (const { p, skuId } of results) {
        if (skuId) {
          p.sku_id = skuId;
          updateSkuStmt.run(skuId, p.id);
        }
      }
      if (i + ENRICH_SKU_CONC < withoutSku.length) {
        await sleep(ENRICH_THROTTLE_MS);
      }
      const soFar = Math.min(i + ENRICH_SKU_CONC, withoutSku.length);
      if (soFar % 500 === 0 || soFar === withoutSku.length) {
        console.log(`[enrich:${superKey}] sku_ids: ${soFar}/${withoutSku.length}`);
      }
    }
  }

  const withSku = products.filter((p) => p.sku_id);

  // Build batches of PROMO_BATCH
  const batches: ProductEnrichRow[][] = [];
  for (let i = 0; i < withSku.length; i += ENRICH_PROMO_BATCH) {
    batches.push(withSku.slice(i, i + ENRICH_PROMO_BATCH));
  }

  for (let i = 0; i < batches.length; i += ENRICH_PROMO_CONC) {
    const chunk = batches.slice(i, i + ENRICH_PROMO_CONC);

    const results = await Promise.all(
      chunk.map((batch) => {
        const skus = batch.map((p) => p.sku_id as string);
        return fetchSearchPromotions(cfg.baseUrl, cfg.promoSeller, skus).then((r) => ({
          batch,
          r,
        }));
      }),
    );

    for (const { batch, r } of results) {
      const generic = r?.promotions?.generic?.promotions ?? {};

      for (const p of batch) {
        st.done++;
        if (!p.sku_id) continue;

        const result = effectiveDiscount(p.sku_id, p.raw_price, generic);
        if (!result) continue;

        updateStmt.run(result.offer_price, result.discount_pct, p.id);
        st.updated++;
      }
    }

    if (i + ENRICH_PROMO_CONC < batches.length) {
      await sleep(ENRICH_THROTTLE_MS);
    }

    const totalDone = st.done + withoutSku.length;
    if (totalDone % 500 === 0 || st.done === withSku.length) {
      console.log(
        `[enrich:${superKey}] ${st.done}/${withSku.length} (search-promotions) — ${st.updated} with promo`,
      );
    }
  }

  // Products without sku_id counted as done (legacy: st.done += withoutSku.length at end)
  st.done += withoutSku.length;
}

// ─── Strategy B: JSON-LD HTML scraping ───────────────────────────────────────

async function enrichViaHtmlScraping(
  superKey: string,
  products: ProductEnrichRow[],
  st: EnrichStatus,
  db: Database.Database,
): Promise<void> {
  const updateStmt = db.prepare(
    'UPDATE products SET offer_price = ?, discount_pct = ? WHERE id = ?',
  );

  for (let i = 0; i < products.length; i += ENRICH_CONCURRENCY) {
    const batch = products.slice(i, i + ENRICH_CONCURRENCY);

    const results = await Promise.all(
      batch.map((p) => fetchPromoPrice(p.product_url ?? '').then((r) => ({ p, r }))),
    );

    for (const { p, r } of results) {
      st.done++;
      if (!r) continue;

      const result = offerPrice(p.raw_price, r);
      if (!result) continue;

      updateStmt.run(result.offer_price, result.discount_pct, p.id);
      st.updated++;
    }

    if (i + ENRICH_CONCURRENCY < products.length) {
      await sleep(ENRICH_THROTTLE_MS);
    }

    if (st.done % 200 === 0 || st.done === st.total) {
      console.log(`[enrich:${superKey}] ${st.done}/${st.total} — ${st.updated} with promo`);
    }
  }
}

// ─── Public factory ───────────────────────────────────────────────────────────

export function makeEnricher(db: Database.Database): EnrichService {
  async function enrichSuper(superKey: string): Promise<void> {
    if (isRunning(superKey)) {
      throw new Error(`Enrichment de ${superKey} ya en curso`);
    }

    const cfg = SUPERS[superKey as SuperKey];

    const products = db
      .prepare(
        'SELECT id, product_id, sku_id, raw_price, product_url FROM products WHERE super = ? ORDER BY id',
      )
      .all(superKey) as ProductEnrichRow[];

    const st: EnrichStatus = {
      total: products.length,
      done: 0,
      updated: 0,
      running: true,
      error: null,
      startedAt: new Date().toISOString(),
    };
    setStatus(superKey, st);

    const strategy = cfg?.promoSeller ? 'search-promotions' : 'html-scraping';
    console.log(`[enrich:${superKey}] Starting (${strategy}) — ${st.total} products`);

    try {
      if (cfg?.promoSeller) {
        await enrichViaPromos(
          superKey,
          cfg as { baseUrl: string; promoSeller: string },
          products,
          st,
          db,
        );
      } else {
        await enrichViaHtmlScraping(superKey, products, st, db);
      }
      console.log(`[enrich:${superKey}] Done. ${st.updated}/${st.total} products with promo.`);
    } catch (err) {
      st.error = (err as Error).message;
      console.error(`[enrich:${superKey}] Error:`, (err as Error).message);
      throw err;
    } finally {
      st.running = false;
    }
  }

  return {
    enrichSuper,
    getStatus,
    isRunning,
  };
}
