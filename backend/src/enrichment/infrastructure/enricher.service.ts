/**
 * enricher.service.ts — Price enrichment service (Prisma/Postgres).
 *
 * Replaces the better-sqlite3 version. Key changes:
 *   - db: Database.Database → prisma: PrismaClient
 *   - All DB writes are async Prisma calls inside runPool workers.
 *   - Per-row updates are individually awaited (connection_limit=25 set in
 *     DATABASE_URL covers htmlConc=20 + headroom — see design §4).
 *
 * Concurrency model unchanged:
 *   ENRICH_HTML_CONC=20    (HTML scraping sliding-window pool)
 *   ENRICH_PROMO_CONC=8    (search-promotions parallel requests)
 *   ENRICH_SKU_CONC=10     (SKU-ID variation API parallel requests)
 *   ENRICH_PROMO_BATCH=20  (SKUs per search-promotions POST)
 */

import type { PrismaClient } from '@prisma/client';
import {
  ENV_ENRICH_HTML_CONC,
  ENV_ENRICH_PROMO_BATCH,
  ENV_ENRICH_PROMO_CONC,
  ENV_ENRICH_SIM_QTY,
  ENV_ENRICH_SKU_CONC,
} from '../../config/env.js';
import { SUPERS, resolveEnrichStrategy } from '../../config/supers.js';
import { fetchSkuId } from '../../infrastructure/vtex/catalog-client.js';
import {
  fetchPromoPrice,
  fetchSearchPromotions,
} from '../../infrastructure/vtex/promotions-client.js';
import { fetchSimulationPromos } from '../../infrastructure/vtex/simulation-client.js';
import { runPool } from '../../shared/pool.js';
import type { EnrichStatus, StoreMap, SuperKey } from '../../shared/types.js';
import { conditionalPromo, effectiveDiscount, offerPrice } from '../domain/discount.js';
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
  cfg: { baseUrl: string },
  seller: string,
  products: ProductEnrichRow[],
  st: EnrichStatus,
  prisma: PrismaClient,
): Promise<void> {
  const skuConc = ENV_ENRICH_SKU_CONC;
  const promoConc = ENV_ENRICH_PROMO_CONC;
  const promoBatch = ENV_ENRICH_PROMO_BATCH;

  // Phase 1: fill missing sku_ids via runPool (skuConc workers in flight at once).
  const withoutSku = products.filter((p) => !p.sku_id);
  if (withoutSku.length) {
    console.log(`[enrich:${superKey}] Fetching sku_id for ${withoutSku.length} products...`);

    let skuLogged = 0;
    await runPool(withoutSku, skuConc, async (p, idx) => {
      const skuId = await fetchSkuId({ baseUrl: cfg.baseUrl }, p.product_id);
      if (skuId) {
        p.sku_id = skuId;
        await prisma.products.update({
          where: { id: p.id },
          data: { sku_id: skuId },
        });
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

  // Phase 2: build 20-SKU batches then process via runPool.
  const withSku = products.filter((p) => p.sku_id);
  const batches: ProductEnrichRow[][] = [];
  for (let i = 0; i < withSku.length; i += promoBatch) {
    batches.push(withSku.slice(i, i + promoBatch));
  }

  let lastLogged = 0;
  await runPool(batches, promoConc, async (batch) => {
    const skus = batch.map((p) => p.sku_id as string);
    const r = await fetchSearchPromotions(cfg.baseUrl, seller, skus);
    const generic = r?.promotions?.generic?.promotions ?? {};

    for (const p of batch) {
      st.done++;
      if (!p.sku_id) continue;

      const result = effectiveDiscount(p.sku_id, p.raw_price, generic);
      if (!result) continue;

      // Conditional promos ("2do al 50%", "3x2") are stored as nth_unit so the
      // frontend computes the per-unit price and renders the same "$X c/u" badge
      // as DIA/Carrefour — the shelf price stays at the regular value. Flat promos
      // ("35%") keep the discounted offer_price (shown as a strike-through) and no badge.
      const promo = conditionalPromo(result.name);
      const data = promo
        ? { offer_price: null, discount_pct: 0, promotions: [promo] as object[] }
        : { offer_price: result.offer_price, discount_pct: result.discount_pct, promotions: [] };

      await prisma.products.update({ where: { id: p.id }, data });
      st.updated++;
    }

    if (st.done - lastLogged >= 500 || st.done === withSku.length) {
      lastLogged = st.done;
      console.log(
        `[enrich:${superKey}] ${st.done}/${withSku.length} (search-promotions) — ${st.updated} with promo`,
      );
    }
  });

  st.done += withoutSku.length;
}

// ─── Strategy B: JSON-LD HTML scraping ───────────────────────────────────────

async function enrichViaHtmlScraping(
  superKey: string,
  baseUrl: string,
  products: ProductEnrichRow[],
  st: EnrichStatus,
  prisma: PrismaClient,
): Promise<void> {
  const htmlConc = ENV_ENRICH_HTML_CONC;

  let fetched_ok = 0;
  let fetch_errors = 0;
  let data_found = 0;
  let lastLogged = 0;

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
          await prisma.products.update({
            where: { id: p.id },
            data: { offer_price: result.offer_price, discount_pct: result.discount_pct },
          });
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

  console.log(
    `[enrich:${superKey}] done — fetched_ok=${fetched_ok} fetch_errors=${fetch_errors} data_found=${data_found} promo_applied=${st.updated}`,
  );

  if (data_found === 0 && products.length > 0) {
    console.warn(
      `[enrich:${superKey}] WARNING: 0/${products.length} pages had server-side JSON-LD — store may have gone client-side; consider enrichStrategy='none'`,
    );
  }
}

// ─── Strategy C: checkout simulation (masonline) ─────────────────────────────

/**
 * Enrich via the checkout orderForm simulation, one POST per SKU.
 *
 * The only path that surfaces VTEX "PromoVolumen" quantity promos (e.g. "2da al
 * 70%") for stores that expose them neither in the IS-API teasers nor in
 * search-promotions (confirmed for masonline). A single simulation at qty N yields
 * BOTH signals, kept separable:
 *   - nth_unit promo: parsed from the benefit identifier names via conditionalPromo()
 *     (same path as VEA's search-promotions). When present it wins — offer_price is
 *     cleared and the per-unit price is computed downstream from raw_price + min_qty.
 *   - flat discount:  items[0].price (unconditional unit) vs listPrice, via offerPrice()
 *     (same math as the JSON-LD strategy it replaces). Used only when there is no
 *     nth_unit promo, so the strike-through stays honest.
 */
async function enrichViaSimulation(
  superKey: string,
  baseUrl: string,
  seller: string,
  quantity: number,
  products: ProductEnrichRow[],
  st: EnrichStatus,
  prisma: PrismaClient,
): Promise<void> {
  const conc = ENV_ENRICH_HTML_CONC;

  let fetched_ok = 0;
  let fetch_errors = 0;
  let nth_unit = 0;
  let lastLogged = 0;

  await runPool(products, conc, async (p) => {
    st.done++;
    if (!p.sku_id) return;

    const outcome = await fetchSimulationPromos(baseUrl, p.sku_id, seller, quantity);
    if (outcome.kind === 'fetch_error') {
      fetch_errors++;
      return;
    }
    fetched_ok++;

    const { benefitNames, unitPrice, listPrice } = outcome.result;

    // nth_unit promo (e.g. "2da al 70%") takes precedence — mirrors enrichViaPromos.
    let promo = null;
    for (const name of benefitNames) {
      promo = conditionalPromo(name);
      if (promo) break;
    }

    let data: { offer_price: number | null; discount_pct: number; promotions: object[] } | null =
      null;
    if (promo) {
      data = { offer_price: null, discount_pct: 0, promotions: [promo] };
      nth_unit++;
    } else if (unitPrice != null && listPrice != null) {
      const flat = offerPrice(p.raw_price, { promoPrice: unitPrice, listPrice });
      data = flat
        ? { offer_price: flat.offer_price, discount_pct: flat.discount_pct, promotions: [] }
        : { offer_price: null, discount_pct: 0, promotions: [] };
    }

    if (data) {
      await prisma.products.update({ where: { id: p.id }, data });
      st.updated++;
    }

    if (st.done - lastLogged >= 600 || st.done === st.total) {
      lastLogged = st.done;
      console.log(
        `[enrich:${superKey}] ${st.done}/${st.total} (simulation) — fetched_ok=${fetched_ok} fetch_errors=${fetch_errors} nth_unit=${nth_unit} updated=${st.updated}`,
      );
    }
  });

  console.log(
    `[enrich:${superKey}] done — fetched_ok=${fetched_ok} fetch_errors=${fetch_errors} nth_unit=${nth_unit} updated=${st.updated}`,
  );
}

// ─── Public factory ───────────────────────────────────────────────────────────

export function makeEnricher(prisma: PrismaClient): EnrichService {
  async function enrichSuper(superKey: string): Promise<void> {
    if (isRunning(superKey)) {
      throw new Error(`Enrichment de ${superKey} ya en curso`);
    }

    const cfg = SUPERS[superKey as SuperKey];

    const products = await prisma.products.findMany({
      where: { super: superKey },
      select: { id: true, product_id: true, sku_id: true, raw_price: true, product_url: true },
      orderBy: { id: 'asc' },
    });

    // Filter products with a valid raw_price (enrichment requires base price)
    const enrichable = products.filter(
      (p): p is ProductEnrichRow => p.raw_price !== null,
    );

    const st: EnrichStatus = {
      total: enrichable.length,
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
        st.done = st.total;
        console.log(`[enrich:${superKey}] skipped — strategy=none (discounts come from the crawl)`);
      } else if (strategy === 'promotions') {
        // Prefer the zone's resolved seller (from the saved location) over the
        // hardcoded config promoSeller, so promos come from the user's sucursal,
        // not a default store. Falls back to promoSeller when no zone is saved.
        let seller = (cfg as { promoSeller: string }).promoSeller;
        try {
          const profile = await prisma.user_profiles.findFirst({ orderBy: { id: 'asc' } });
          const stores = profile?.stores as StoreMap | null;
          const zoneSeller = stores?.[superKey as SuperKey]?.[0]?.sellerId;
          if (zoneSeller) seller = zoneSeller;
        } catch {
          // no profile / stores → keep the config promoSeller fallback
        }
        await enrichViaPromos(superKey, cfg as { baseUrl: string }, seller, enrichable, st, prisma);
      } else if (strategy === 'simulation') {
        const baseUrl = cfg?.baseUrl ?? '';
        const simSeller = cfg?.simSeller ?? '1';
        await enrichViaSimulation(
          superKey,
          baseUrl,
          simSeller,
          ENV_ENRICH_SIM_QTY,
          enrichable,
          st,
          prisma,
        );
      } else {
        // strategy === 'jsonld'
        const baseUrl = cfg?.baseUrl ?? '';
        await enrichViaHtmlScraping(superKey, baseUrl, enrichable, st, prisma);
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
