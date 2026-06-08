'use strict';

const db      = require('./db');
const { SUPERS } = require('../vtex-crawler');

const CONCURRENCY    = 15;   // requests en paralelo (HTML scraping fallback)
const THROTTLE_MS    = 250;
const PROMO_BATCH    = 20;   // SKUs por request a search-promotions (límite duro del endpoint)
const PROMO_CONC     = 8;    // requests concurrentes a search-promotions

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// superKey → { total, done, updated, running, error, startedAt }
const status = new Map();

// ─── Estrategia A: search-promotions (VTEX) ──────────────────────────────────

async function fetchSearchPromotions(baseUrl, seller, skus) {
  try {
    const res = await fetch(`${baseUrl}/_v/search-promotions`, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ seller, skus }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

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
    return data?.skus?.[0]?.sku ? String(data.skus[0].sku) : null;
  } catch {
    return null;
  }
}

async function enrichViaPromos(superKey, cfg, products, st, updateStmt) {
  const updateSkuStmt = db.prepare(`UPDATE products SET sku_id = ? WHERE id = ?`);

  // Primero: rellenar sku_ids faltantes en batches
  const withoutSku = products.filter(p => !p.sku_id);
  if (withoutSku.length) {
    console.log(`[enrich:${superKey}] Obteniendo sku_id para ${withoutSku.length} productos…`);
    const SKU_CONC = 10;
    for (let i = 0; i < withoutSku.length; i += SKU_CONC) {
      const chunk = withoutSku.slice(i, i + SKU_CONC);
      const results = await Promise.all(
        chunk.map(p => fetchSkuId(cfg.baseUrl, p.product_id).then(skuId => ({ p, skuId })))
      );
      for (const { p, skuId } of results) {
        if (skuId) {
          p.sku_id = skuId;
          updateSkuStmt.run([skuId, p.id]);
        }
      }
      if (i + SKU_CONC < withoutSku.length) {
        await new Promise(res => setTimeout(res, THROTTLE_MS));
      }
      if ((i + SKU_CONC) % 500 === 0 || i + SKU_CONC >= withoutSku.length) {
        console.log(`[enrich:${superKey}] sku_ids: ${Math.min(i + SKU_CONC, withoutSku.length)}/${withoutSku.length}`);
      }
    }
  }

  const withSku = products.filter(p => p.sku_id);

  const batches = [];
  for (let i = 0; i < withSku.length; i += PROMO_BATCH) {
    batches.push(withSku.slice(i, i + PROMO_BATCH));
  }

  for (let i = 0; i < batches.length; i += PROMO_CONC) {
    const chunk = batches.slice(i, i + PROMO_CONC);

    const results = await Promise.all(
      chunk.map(batch => {
        const skus = batch.map(p => p.sku_id);
        return fetchSearchPromotions(cfg.baseUrl, cfg.promoSeller, skus)
          .then(r => ({ batch, r }));
      })
    );

    for (const { batch, r } of results) {
      const generic = r?.promotions?.generic?.promotions || {};

      for (const p of batch) {
        st.done++;
        const promo = generic[p.sku_id];
        if (!promo) continue;

        const effectiveDiscount = parseFloat(promo.effectiveDiscount);
        if (!effectiveDiscount || effectiveDiscount <= 0 || effectiveDiscount > 0.8) continue;

        const pct       = Math.round(effectiveDiscount * 100);
        const offerPrice = Math.round(p.raw_price * (1 - effectiveDiscount) * 100) / 100;

        if (offerPrice < p.raw_price) {
          updateStmt.run([offerPrice, pct, p.id]);
          st.updated++;
        }
      }
    }

    // Contabilizar los sin-sku como done para que el progreso no se trabe
    st.done += withoutSku.length * 0; // ya ignorados arriba

    if (i + PROMO_CONC < batches.length) {
      await new Promise(res => setTimeout(res, THROTTLE_MS));
    }

    const totalDone = st.done + withoutSku.length;
    if (totalDone % 500 === 0 || st.done === withSku.length) {
      console.log(`[enrich:${superKey}] ${st.done}/${withSku.length} (search-promotions) — ${st.updated} con promo`);
    }
  }

  // Los sin sku_id quedan con done contabilizado
  st.done += withoutSku.length;
}

// ─── Estrategia B: JSON-LD scraping (fallback para supers sin promoSeller) ───

async function fetchPromoPrice(productUrl) {
  try {
    const r = await fetch(productUrl, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const html = await r.text();

    for (const m of html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const obj = JSON.parse(m[1]);
        if (typeof obj.offers?.price === 'number') {
          return {
            promoPrice: obj.offers.price,
            listPrice: typeof obj.offers.priceSpecification?.price === 'number'
              ? obj.offers.priceSpecification.price
              : null,
          };
        }
        if (typeof obj.offers?.lowPrice === 'number') {
          return { promoPrice: obj.offers.lowPrice, listPrice: null };
        }
      } catch { /* JSON malformado: skip */ }
    }
    return null;
  } catch {
    return null;
  }
}

async function enrichViaHtmlScraping(superKey, products, st, updateStmt) {
  for (let i = 0; i < products.length; i += CONCURRENCY) {
    const batch = products.slice(i, i + CONCURRENCY);

    const results = await Promise.all(
      batch.map(p => fetchPromoPrice(p.product_url).then(r => ({ p, r })))
    );

    for (const { p, r } of results) {
      st.done++;
      if (!r) continue;

      const { promoPrice, listPrice } = r;
      const basePrice = (listPrice != null && listPrice > promoPrice) ? listPrice : p.raw_price;

      if (promoPrice < basePrice) {
        const pct = Math.round(((basePrice - promoPrice) / basePrice) * 100);
        updateStmt.run([promoPrice, pct, p.id]);
        st.updated++;
      }
    }

    if (i + CONCURRENCY < products.length) {
      await new Promise(res => setTimeout(res, THROTTLE_MS));
    }

    if (st.done % 200 === 0 || st.done === st.total) {
      console.log(`[enrich:${superKey}] ${st.done}/${st.total} — ${st.updated} con promo`);
    }
  }
}

// ─── Enriquecimiento principal ────────────────────────────────────────────────

async function enrichSuper(superKey) {
  if (status.get(superKey)?.running) {
    throw new Error(`Enrichment de ${superKey} ya en curso`);
  }

  const cfg = SUPERS[superKey];

  const products = db.prepare(
    `SELECT id, product_id, sku_id, raw_price, product_url FROM products WHERE super = ? ORDER BY id`
  ).all(superKey);

  const st = { total: products.length, done: 0, updated: 0, running: true, error: null, startedAt: new Date().toISOString() };
  status.set(superKey, st);

  const updateStmt = db.prepare(
    `UPDATE products SET offer_price = ?, discount_pct = ? WHERE id = ?`
  );

  const strategy = cfg?.promoSeller ? 'search-promotions' : 'html-scraping';
  console.log(`[enrich:${superKey}] Iniciando (${strategy}) — ${st.total} productos`);

  try {
    if (cfg?.promoSeller) {
      await enrichViaPromos(superKey, cfg, products, st, updateStmt);
    } else {
      await enrichViaHtmlScraping(superKey, products, st, updateStmt);
    }
    console.log(`[enrich:${superKey}] Listo. ${st.updated}/${st.total} productos con promo.`);
  } catch (err) {
    st.error = err.message;
    console.error(`[enrich:${superKey}] Error:`, err.message);
    throw err;
  } finally {
    st.running = false;
  }
}

function getStatus() {
  const out = {};
  for (const [k, v] of status) out[k] = { ...v };
  return out;
}

function isRunning(superKey) {
  return status.get(superKey)?.running === true;
}

module.exports = { enrichSuper, getStatus, isRunning };
