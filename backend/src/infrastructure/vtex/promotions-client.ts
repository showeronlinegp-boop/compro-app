/**
 * promotions-client.ts — VTEX promotions endpoints.
 *
 * Exports:
 *   fetchSearchPromotions — Strategy A: POST /_v/search-promotions (vea/promoSeller)
 *   fetchPromoPrice       — Strategy B: GET HTML + parse JSON-LD offers.price / lowPrice
 *
 * Ported from backend/enricher.js: fetchSearchPromotions(), fetchPromoPrice().
 * Return null on any failure — identical semantics to legacy.
 * NOT yet wired into the running app — Slice 6 cutover.
 */

import { UA } from '../../config/throttles.js';

// ---------------------------------------------------------------------------
// Strategy A — search-promotions
// ---------------------------------------------------------------------------

export interface PromoEntry {
  ref_id: string;
  name: string;
  type: string;
  effectiveDiscount: string; // decimal string, e.g. "0.37"
}

export interface SearchPromotionsResponse {
  promotions: {
    generic?: { promotions: Record<string, PromoEntry> };
    [key: string]: unknown;
  };
}

/**
 * POST /_v/search-promotions for a batch of SKU IDs.
 * Batch size must not exceed ENRICH_PROMO_BATCH (hard endpoint limit of 20).
 * Returns null on any network or HTTP error.
 * Port of fetchSearchPromotions() in enricher.js.
 */
export async function fetchSearchPromotions(
  baseUrl: string,
  seller: string,
  skus: string[],
): Promise<SearchPromotionsResponse | null> {
  try {
    const res = await fetch(`${baseUrl}/_v/search-promotions`, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ seller, skus }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as SearchPromotionsResponse;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Strategy B — JSON-LD scraping
// ---------------------------------------------------------------------------

export interface PromoPriceResult {
  promoPrice: number;
  listPrice: number | null;
}

/**
 * Parse JSON-LD blocks from an HTML string and extract offers.price / lowPrice.
 *
 * Pure function — no network. Exported for unit testing.
 * Parses each <script type="application/ld+json"> block in order.
 * Prefers offers.price (number) over offers.lowPrice (number).
 * Returns { promoPrice, listPrice } or null if no matching block is found.
 *
 * Port of the inner loop from fetchPromoPrice() in enricher.js.
 */
export function parseJsonLdFromHtml(html: string): PromoPriceResult | null {
  for (const m of html.matchAll(
    /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const obj = JSON.parse(m[1] ?? '') as Record<string, unknown>;
      const offers = obj.offers as Record<string, unknown> | undefined;
      if (offers == null) continue;

      if (typeof offers.price === 'number') {
        const spec = offers.priceSpecification as Record<string, unknown> | undefined;
        return {
          promoPrice: offers.price,
          listPrice: typeof spec?.price === 'number' ? spec.price : null,
        };
      }
      if (typeof offers.lowPrice === 'number') {
        return { promoPrice: offers.lowPrice, listPrice: null };
      }
    } catch {
      // malformed JSON — skip block
    }
  }
  return null;
}

/**
 * GET product HTML page and parse JSON-LD offers.price / lowPrice.
 *
 * Port of fetchPromoPrice() in enricher.js — identical match logic.
 * NOTE: carrefour renders JSON-LD client-side; fixture confirms the HTML
 * body contains no ld+json blocks, so this function correctly returns null.
 */
export async function fetchPromoPrice(productUrl: string): Promise<PromoPriceResult | null> {
  try {
    const r = await fetch(productUrl, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return null;
    const html = await r.text();
    return parseJsonLdFromHtml(html);
  } catch {
    return null;
  }
}
