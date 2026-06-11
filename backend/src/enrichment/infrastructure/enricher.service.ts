/**
 * enricher.service.ts — Price enrichment service.
 *
 * Ports backend/enricher.js enrichSuper, enrichViaPromos, enrichViaHtmlScraping.
 * Strategy A: search-promotions endpoint (supers with promoSeller configured).
 * Strategy B: HTML JSON-LD scraping (all other supers).
 *
 * Concurrency model (modernized — matches crawler pattern):
 *   ENRICH_HTML_CONC=20    (HTML scraping sliding-window pool, env: ENRICH_HTML_CONC)
 *   ENRICH_PROMO_CONC=8    (search-promotions parallel requests, env: ENRICH_PROMO_CONC)
 *   ENRICH_SKU_CONC=10     (SKU-ID variation API parallel requests, env: ENRICH_SKU_CONC)
 *   ENRICH_PROMO_BATCH=20  (SKUs per search-promotions POST — hard endpoint limit)
 *
 * Both strategies use runPool (bounded sliding-window) instead of manual
 * for(i+=CONC) { await Promise.all(slice) } + per-batch sleep(THROTTLE_MS).
 * Rate control: concurrency cap + fetchWithRetry exponential backoff (inside fetchPromoPrice).
 * Rollback: set ENRICH_HTML_CONC=1 env var → sequential behavior, no code change.
 *
 * fetchSkuId imported from catalog-client (SINGLE canonical source — dedup enforced).
 * DB update SQL matches legacy: UPDATE products SET offer_price=?, discount_pct=? WHERE id=?
 * better-sqlite3 is synchronous + single-threaded JS: updateStmt.run() calls inside
 * concurrent workers (between awaits) are safe — no DB race possible.
 */

import type Database from 'better-sqlite3';
import {
  ENV_ENRICH_HTML_CONC,
  ENV_ENRICH_PROMO_BATCH,
  ENV_ENRICH_PROMO_CONC,
  ENV_ENRICH_SKU_CONC,
} from '../../config/env.js';
import { SUPERS, resolveEnrichStrategy } from '../../config/supers.js';
import { fetchSkuId } from '../../infrastructure/vtex/catalog-client.js';
import {
  fetchPromoPrice,
  fetchSearchPromotions,
} from '../../infrastructure/vtex/promotions-client.js';
import { runPool } from '../../shared/pool.js';
import type { EnrichStatus, SuperKey } from '../../shared/types.js';
import { effectiveDiscount, offerPrice } from '../domain/discount.js';
import { getStatus, isRunning, setStatus } from './enrich-state.js';

export interface EnrichService {
  enrichSuper: (superKey: string) => Promise<void>;
  getStatus: () => Record<string, EnrichStatus>;
  isRunning: (superKey: string) => boolean;
}

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
  const skuConc = ENV_ENRICH_SKU_CONC;
  const promoConc = ENV_ENRICH_PROMO_CONC;
  const promoBatch = ENV_ENRICH_PROMO_BATCH;

  const updateSkuStmt = db.prepare('UPDATE products SET sku_id = ? WHERE id = ?');
  const updateStmt = db.prepare(
    'UPDATE products SET offer_price = ?, discount_pct = ? WHERE id = ?',
  );

  // Phase 1: fill missing sku_ids via runPool (skuConc workers in flight at once).
  const withoutSku = products.filter((p) => !p.sku_id);
  if (withoutSku.length) {
    console.log(`[enrich:${superKey}] Fetching sku_id for ${withoutSku.length} products...`);

    let skuLogged = 0;
    await runPool(withoutSku, skuConc, async (p, idx) => {
      const skuId = await fetchSkuId({ baseUrl: cfg.baseUrl }, p.product_id);
      if (skuId) {
        p.sku_id = skuId;
        // better-sqlite3 is synchronous; .run() between awaits is safe (single-threaded JS).
        updateSkuStmt.run(skuId, p.id);
      }
      const soFar = idx + 1;
      if (soFar % 500 === 0 || soFar === withoutSku.length) {
        if (soFar > skuLogged) {
          skuLogged = soFar;
          console.log(`[enrich:${superKey}] sku_ids: ${soFar}/${withoutSku.length}`);
        }
      }
    });
  }

  // Phase 2: build 20-SKU batches (hard endpoint limit) then process via runPool.
  const withSku = products.filter((p) => p.sku_id);
  const batches: ProductEnrichRow[][] = [];
  for (let i = 0; i < withSku.length; i += promoBatch) {
    batches.push(withSku.slice(i, i + promoBatch));
  }

  let lastLogged = 0;
  await runPool(batches, promoConc, async (batch) => {
    const skus = batch.map((p) => p.sku_id as string);
    const r = await fetchSearchPromotions(cfg.baseUrl, cfg.promoSeller, skus);
    const generic = r?.promotions?.generic?.promotions ?? {};

    for (const p of batch) {
      st.done++;
      if (!p.sku_id) continue;

      const result = effectiveDiscount(p.sku_id, p.raw_price, generic);
      if (!result) continue;

      // better-sqlite3 is synchronous; .run() between awaits is safe (single-threaded JS).
      updateStmt.run(result.offer_price, result.discount_pct, p.id);
      st.updated++;
    }

    if (st.done - lastLogged >= 500 || st.done === withSku.length) {
      lastLogged = st.done;
      console.log(
        `[enrich:${superKey}] ${st.done}/${withSku.length} (search-promotions) — ${st.updated} with promo`,
      );
    }
  });

  // Products without sku_id counted as done (legacy: st.done += withoutSku.length at end).
  st.done += withoutSku.length;
}

// ─── Strategy B: JSON-LD HTML scraping ───────────────────────────────────────

async function enrichViaHtmlScraping(
  superKey: string,
  baseUrl: string,
  products: ProductEnrichRow[],
  st: EnrichStatus,
  db: Database.Database,
): Promise<void> {
  const htmlConc = ENV_ENRICH_HTML_CONC;

  // better-sqlite3 is synchronous; .run() between awaits is safe (single-threaded JS).
  const updateStmt = db.prepare(
    'UPDATE products SET offer_price = ?, discount_pct = ? WHERE id = ?',
  );

  // Observability counters — track each outcome kind so "broken" never looks like "no promos found".
  let fetched_ok = 0;
  let fetch_errors = 0;
  let data_found = 0;
  let lastLogged = 0;

  // runPool replaces the manual for(i+=CONC){await Promise.all(slice)} + sleep(THROTTLE_MS) loop.
  // No discrete batches → no inter-batch idle time. Rate control = concurrency cap + fetchWithRetry
  // backoff inside fetchPromoPrice. Counters/st mutations are safe (single-threaded JS).
  await runPool(products, htmlConc, async (p) => {
    const outcome = await fetchPromoPrice(p.product_url ?? '', baseUrl);
    st.done++;

    if (outcome.kind === 'fetch_error') {
      fetch_errors++;
    } else {
      fetched_ok++;

      if (outcome.kind === 'found') {
        data_found++;
        const result = offerPrice(p.raw_price, outcome.result);
        if (result) {
          updateStmt.run(result.offer_price, result.discount_pct, p.id);
          st.updated++;
        }
      }
    }

    if (st.done - lastLogged >= 600 || st.done === st.total) {
      lastLogged = st.done;
      console.log(
        `[enrich:${superKey}] ${st.done}/${st.total} — fetched_ok=${fetched_ok} data_found=${data_found} promo=${st.updated}`,
      );
    }
  });

  // Summary line for observability — make every counter visible at run end.
  console.log(
    `[enrich:${superKey}] done — fetched_ok=${fetched_ok} fetch_errors=${fetch_errors} data_found=${data_found} promo_applied=${st.updated}`,
  );

  // Safety-net monitor: if ZERO pages had server-side JSON-LD but we fetched products,
  // the store may have switched to client-side rendering (like Carrefour).
  // This does NOT abort the run — it just flags the situation so an operator can set
  // enrichStrategy='none' for that super.
  if (data_found === 0 && products.length > 0) {
    console.warn(
      `[enrich:${superKey}] WARNING: 0/${products.length} pages had server-side JSON-LD — store may have gone client-side; consider enrichStrategy='none'`,
    );
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

    const strategy = resolveEnrichStrategy(superKey);
    console.log(`[enrich:${superKey}] Starting (${strategy}) — ${st.total} products`);

    try {
      if (strategy === 'none') {
        // Skip enrichment entirely. Discounts for this super come from the crawl itself
        // (IS-API PriceWithoutDiscount vs Price). The DB records are already correct — do
        // not overwrite them with zeros. Just mark the run complete immediately.
        st.done = st.total;
        console.log(`[enrich:${superKey}] skipped — strategy=none (discounts come from the crawl)`);
      } else if (strategy === 'promotions') {
        await enrichViaPromos(
          superKey,
          cfg as { baseUrl: string; promoSeller: string },
          products,
          st,
          db,
        );
      } else {
        // strategy === 'jsonld'
        const baseUrl = cfg?.baseUrl ?? '';
        await enrichViaHtmlScraping(superKey, baseUrl, products, st, db);
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
