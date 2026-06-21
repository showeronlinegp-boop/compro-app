/**
 * normalizer.ts — IS product → NormalizedCrawlItem.
 *
 * Ported from vtex-crawler.js: buildNormalizer().
 * Exact behavior preserved:
 *   - AvailableQuantity === 0  → return null (skip)
 *   - PriceWithoutDiscount used as basePrice when present; falls back to Price
 *   - Discount guard: rawDiscount > 0 && rawDiscount <= 80 (80% cap)
 *   - ListPrice is IGNORED (stale pre-inflation values)
 *   - category_paths deduped by trimming leading/trailing slashes, replacing inner / with ' > '
 *
 * NOT yet wired into the running app — Slice 5 cutover.
 */

import type { NormalizedCrawlItem, Promotion, SuperConfig } from '../../shared/types.js';
import type { IsSearchProduct, IsTeaser } from './is-client.js';

/**
 * The maximum discount percentage we trust from VTEX IS data.
 * rawDiscount must be > 0 AND <= DISCOUNT_CAP to be considered real.
 *
 * Value confirmed from vtex-crawler.js line 144:
 *   const hasDiscount = rawDiscount > 0 && rawDiscount <= 80;
 */
export const DISCOUNT_CAP = 80;

function num(v: unknown): number | null {
  if (v == null || Number.isNaN(Number(v))) return null;
  return Number(v);
}

/**
 * Derive the per-Nth-unit discount percentage stated in a promo label, for the
 * downstream per-unit formula  base * (n - pct/100) / n.
 *
 * VTEX's teaser `PercentualDiscount` is NOT consistent across supers — it often
 * carries the AVERAGED effective discount, which that formula misreads (e.g.
 * carrefour stores 25 for "2do al 50%", and 33.33 for "3x2"). The human-readable
 * label states the real promo, so we parse it. Two formats:
 *
 *   - "NxM" buy-N-pay-M (e.g. "3x2", "2x1"): (N-M) units are free, so the equivalent
 *     pct is (N - M) * 100 → 3x2 → 100 (one free unit), 2x1 → 100. With min_qty = N
 *     the formula yields base * M / N (3x2 of $509 → $339,33).
 *   - "...al X%" (e.g. "2do al 50%"): X is the per-Nth-unit discount directly.
 *
 * Guards against false positives: the "al X%" branch requires a `%` sign (so date
 * ranges like "8/6 al 14/6" are ignored), and the NxM branch requires N > M (so
 * size tokens like "2x500ml" are ignored). Returns null when neither matches.
 */
function parseLabelDiscountPct(label: string | undefined): number | null {
  if (!label) return null;

  const nxm = label.match(/\b(\d+)\s*[xX]\s*(\d+)\b/);
  if (nxm) {
    const n = Number(nxm[1]);
    const m = Number(nxm[2]);
    if (Number.isFinite(n) && Number.isFinite(m) && n > m && m > 0) return (n - m) * 100;
  }

  const alX = label.match(/\bal\s+(\d+(?:[.,]\d+)?)\s*%/i);
  if (alX?.[1]) {
    const pct = Number(alX[1].replace(',', '.'));
    if (Number.isFinite(pct)) return pct;
  }

  return null;
}

/**
 * Map VTEX teasers (conditional / cart-level promos) to Promotion[].
 *
 * These promos — "2do al 80%", "2x1" — keep Price === PriceWithoutDiscount, so
 * the unit-discount path above never sees them. We surface them here without
 * touching raw_price/offer_price, since the real price depends on quantity.
 *
 * discount_pct is taken from the label's "al X%" (the per-Nth-unit discount, which
 * is consistent across supers) and only falls back to the teaser's PercentualDiscount
 * field when the label has no such pattern.
 */
function extractPromotions(teasers: IsTeaser[] | undefined): Promotion[] {
  if (!teasers?.length) return [];
  return teasers.map((t) => {
    const pctRaw = t.effects?.parameters?.find((p) => p.name === 'PercentualDiscount')?.value;
    const pctFromField = pctRaw != null && pctRaw !== '' ? Number(pctRaw) : null;
    // An nth-unit promo ("2do al 50%") requires a real quantity threshold (>= 2).
    // VTEX reports minimumQuantity 0 for unconditional/flat promos (e.g. a payment
    // discount like "Tarjeta Carrefour 15%") — those are NOT nth-unit promos, so we
    // surface them as informational 'other' badges with no quantity, instead of
    // mislabeling them 'nth_unit' (which implies a per-Nth-unit price calculation).
    const rawMinQty = t.conditions?.minimumQuantity ?? null;
    const isNthUnit = rawMinQty != null && rawMinQty >= 2;
    return {
      label: t.name,
      type: isNthUnit ? 'nth_unit' : 'other',
      min_qty: isNthUnit ? rawMinQty : null,
      discount_pct: parseLabelDiscountPct(t.name) ?? pctFromField,
    };
  });
}

/**
 * Returns a normalizer function bound to the given super config.
 * Port of buildNormalizer(cfg) in vtex-crawler.js.
 */
export function buildNormalizer(
  cfg: SuperConfig,
): (p: IsSearchProduct) => NormalizedCrawlItem | null {
  return function normalize(p: IsSearchProduct): NormalizedCrawlItem | null {
    const item = p.items?.[0];
    const seller = item?.sellers?.[0];
    const offer = seller?.commertialOffer;

    // Hard skip: IS API sometimes includes AvailableQuantity=0 despite hideUnavailableItems=true
    if (num(offer?.AvailableQuantity) === 0) {
      return null;
    }

    // PriceWithoutDiscount = real base price (pre catalog-discount).
    // Price = current sale price (may be lower due to catalog discount).
    // ListPrice = strike-through price; trustworthy for some supers (dia/masonline/
    // carrefour), stale garbage for others (vea) — gated by cfg.trustListPrice.
    const salePrice = num(offer?.Price);
    const priceWithoutDiscount = num(offer?.PriceWithoutDiscount);

    // VTEX bakes UNCONDITIONAL teaser discounts — payment-method promos like
    // "Tarjeta Carrefour 15%" / "Cuenta Digital Carrefour 15%" (minimumQuantity 0) —
    // straight into commertialOffer.Price. That makes Price < PriceWithoutDiscount
    // even though the real shelf price everyone pays is PriceWithoutDiscount. These
    // are NOT catalog markdowns (they only apply if you pay a certain way), so the
    // Price/PWD gap must not become an offer_price: doing so showed a phantom
    // discount AND let the nth-unit promo calc compound on an already-discounted
    // base (e.g. Lays 77g: shelf 3844.62 mis-stored as offer 2691.23, then
    // "2do al 70%" applied on top → 1749.30 instead of the real 2499 c/u).
    // nth-unit teasers (minimumQuantity >= 2) never lower the single-unit Price,
    // so they do not contaminate it and are left to the promotions[] path.
    const hasUnconditionalTeaserDiscount = (offer?.teasers ?? []).some(
      (t) => (t.conditions?.minimumQuantity ?? 0) === 0,
    );
    // Contamination only manifests as Price < PriceWithoutDiscount: that gap is the
    // payment-method discount baked in. When Price === PWD the teaser is NOT
    // lowering Price, so a ListPrice markdown below remains a legitimate catalog
    // discount and must be preserved.
    const priceContaminated =
      hasUnconditionalTeaserDiscount &&
      salePrice != null &&
      priceWithoutDiscount != null &&
      salePrice < priceWithoutDiscount;

    // Primary signal: PriceWithoutDiscount vs Price. Suppressed when Price is
    // contaminated by an unconditional teaser (see above).
    let baseForDiscount = priceWithoutDiscount ?? salePrice;
    let rawDiscount =
      !priceContaminated &&
      baseForDiscount != null &&
      salePrice != null &&
      salePrice < baseForDiscount
        ? Math.round(((baseForDiscount - salePrice) / baseForDiscount) * 100)
        : 0;

    // Fallback: some supers keep Price === PriceWithoutDiscount and encode the
    // discount in ListPrice. Only trusted when cfg.trustListPrice is set, and
    // never when Price is contaminated by an unconditional teaser.
    if (rawDiscount === 0 && !priceContaminated && cfg.trustListPrice) {
      const listPrice = num(offer?.ListPrice);
      if (listPrice != null && salePrice != null && salePrice < listPrice) {
        baseForDiscount = listPrice;
        rawDiscount = Math.round(((listPrice - salePrice) / listPrice) * 100);
      }
    }

    // Discount guard: cap at 80% to reject stale base/ListPrice values
    // from previous inflationary periods (vtex-crawler.js: rawDiscount <= 80).
    const hasDiscount = rawDiscount > 0 && rawDiscount <= DISCOUNT_CAP;

    // True single-unit shelf price. When Price is contaminated by an unconditional
    // teaser, fall back to PriceWithoutDiscount instead of the discounted Price.
    const shelfPrice = priceContaminated ? (priceWithoutDiscount ?? salePrice) : salePrice;

    const categoryPaths = (p.categories ?? [])
      .map((c) => c.replace(/^\/|\/$/g, '').replace(/\//g, ' > '))
      .filter(Boolean);

    return {
      product_id: String(p.productId),
      sku_id: item?.itemId ? String(item.itemId) : null,
      name: p.productName,
      barcode: item?.ean ?? null,
      image_url: item?.images?.[0]?.imageUrl ?? null,
      product_url: p.link ?? `${cfg.baseUrl}/${p.linkText}/p`,
      raw_price: hasDiscount ? baseForDiscount : shelfPrice,
      offer_price: hasDiscount ? salePrice : null,
      discount_pct: hasDiscount ? rawDiscount : 0,
      available: true, // guaranteed by hideUnavailableItems=true (+ AvailableQuantity check above)
      category_paths: categoryPaths,
      // Teasers carry conditional promos for supers that expose them (dia/carrefour).
      // VEA has none here — its promo comes from the search-promotions enricher.
      promotions: extractPromotions(offer?.teasers),
    };
  };
}
