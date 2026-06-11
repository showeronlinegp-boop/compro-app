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

import { fetchText, fetchWithRetry } from '../../shared/fetch.js';
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

// ---------------------------------------------------------------------------
// Strategy B — discriminated outcome (replaces nullable return)
// ---------------------------------------------------------------------------

/**
 * Discriminated result for fetchPromoPrice.
 *
 * - fetch_error: network threw or HTTP non-2xx (URL resolution failure falls here too)
 * - no_data:     fetched ok but no parseable ld+json offers block in the HTML
 * - found:       fetched ok AND offers.price / lowPrice found
 *
 * Replaces the previous `PromoPriceResult | null` return so callers can
 * distinguish "broken" from "no promo" — fixing the observability gap.
 */
export type PromoFetchOutcome =
  | { kind: 'fetch_error' }
  | { kind: 'no_data' }
  | { kind: 'found'; result: PromoPriceResult };

/**
 * GET product HTML page and parse JSON-LD offers.price / lowPrice.
 *
 * Accepts an optional baseUrl so relative product_url values (e.g. "/x/p")
 * are resolved to absolute before fetching. Already-absolute URLs are
 * unchanged (new URL(abs, base).href === abs).
 *
 * Returns a PromoFetchOutcome discriminated union so callers can tally
 * fetch_error / no_data / found separately for observability.
 *
 * NOTE: carrefour renders JSON-LD client-side; fixture confirms the HTML
 * body contains no ld+json blocks — this function will return no_data for
 * carrefour products regardless of URL resolution.
 */
export async function fetchPromoPrice(
  productUrl: string,
  baseUrl?: string,
): Promise<PromoFetchOutcome> {
  let resolvedUrl: string;
  try {
    resolvedUrl = baseUrl ? new URL(productUrl, baseUrl).href : productUrl;
  } catch {
    return { kind: 'fetch_error' };
  }

  try {
    // fetchText throws HttpError on non-2xx; fetchWithRetry retries 429/5xx with
    // exponential backoff + full jitter. 403 is NOT retried (WAF hard block).
    // On final retry exhaustion or non-retryable status, the HttpError propagates
    // to the outer catch which maps it to { kind: 'fetch_error' }.
    const html = await fetchWithRetry(() =>
      fetchText(resolvedUrl, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
      }),
    );
    const result = parseJsonLdFromHtml(html);
    return result ? { kind: 'found', result } : { kind: 'no_data' };
  } catch {
    return { kind: 'fetch_error' };
  }
}
