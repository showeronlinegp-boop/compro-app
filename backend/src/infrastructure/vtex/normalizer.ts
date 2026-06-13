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
 * Extract the per-Nth-unit discount stated in a promo label, e.g. "2do al 50%" → 50.
 *
 * VTEX's teaser `PercentualDiscount` is NOT consistent across supers: some report
 * the per-Nth-unit discount (dia: "2do al 50%" → 50), others report the effective
 * averaged discount over the qualifying quantity (carrefour: "2do al 50%" → 25).
 * Stored raw, this makes identical promos render different per-unit prices, because
 * the downstream per-unit formula expects the per-Nth-unit discount.
 *
 * The label consistently states the real per-Nth-unit percentage, so we parse it.
 * Anchored to the `%` sign so trailing noise without a percent sign (e.g. carrefour's
 * "...-Reg-2-50-AS9 AL 16.6") is ignored. Returns null when there is no "al X%" match.
 */
function parseLabelDiscountPct(label: string | undefined): number | null {
  if (!label) return null;
  const m = label.match(/\bal\s+(\d+(?:[.,]\d+)?)\s*%/i);
  if (!m?.[1]) return null;
  const pct = Number(m[1].replace(',', '.'));
  return Number.isFinite(pct) ? pct : null;
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

    // Primary signal: PriceWithoutDiscount vs Price.
    let baseForDiscount = num(offer?.PriceWithoutDiscount) ?? salePrice;
    let rawDiscount =
      baseForDiscount != null && salePrice != null && salePrice < baseForDiscount
        ? Math.round(((baseForDiscount - salePrice) / baseForDiscount) * 100)
        : 0;

    // Fallback: some supers keep Price === PriceWithoutDiscount and encode the
    // discount in ListPrice. Only trusted when cfg.trustListPrice is set.
    if (rawDiscount === 0 && cfg.trustListPrice) {
      const listPrice = num(offer?.ListPrice);
      if (listPrice != null && salePrice != null && salePrice < listPrice) {
        baseForDiscount = listPrice;
        rawDiscount = Math.round(((listPrice - salePrice) / listPrice) * 100);
      }
    }

    // Discount guard: cap at 80% to reject stale base/ListPrice values
    // from previous inflationary periods (vtex-crawler.js: rawDiscount <= 80).
    const hasDiscount = rawDiscount > 0 && rawDiscount <= DISCOUNT_CAP;

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
      raw_price: hasDiscount ? baseForDiscount : salePrice,
      offer_price: hasDiscount ? salePrice : null,
      discount_pct: hasDiscount ? rawDiscount : 0,
      available: true, // guaranteed by hideUnavailableItems=true (+ AvailableQuantity check above)
      category_paths: categoryPaths,
      promotions: extractPromotions(offer?.teasers),
    };
  };
}
