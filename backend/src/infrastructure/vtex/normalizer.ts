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

import type { NormalizedCrawlItem, SuperConfig } from '../../shared/types.js';
import type { IsSearchProduct } from './is-client.js';

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
    // ListPrice = stale pre-inflation price — IGNORED per vtex-crawler.js comment.
    const basePrice = num(offer?.PriceWithoutDiscount) ?? num(offer?.Price);
    const salePrice = num(offer?.Price);

    // Discount guard: cap at 80% to reject stale PriceWithoutDiscount values
    // from previous inflationary periods (vtex-crawler.js: rawDiscount <= 80).
    const rawDiscount =
      basePrice != null && salePrice != null && salePrice < basePrice
        ? Math.round(((basePrice - salePrice) / basePrice) * 100)
        : 0;
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
      raw_price: hasDiscount ? basePrice : salePrice,
      offer_price: hasDiscount ? salePrice : null,
      discount_pct: hasDiscount ? rawDiscount : 0,
      available: true, // guaranteed by hideUnavailableItems=true (+ AvailableQuantity check above)
      category_paths: categoryPaths,
    };
  };
}
