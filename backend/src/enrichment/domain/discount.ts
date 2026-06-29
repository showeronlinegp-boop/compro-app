/**
 * discount.ts — Pure discount calculation logic for the enricher.
 *
 * Ported from backend/enricher.js:
 *   Strategy A: effectiveDiscount from search-promotions (enrichViaPromos inner loop)
 *   Strategy B: JSON-LD price selection from HTML pages (enrichViaHtmlScraping inner loop)
 *
 * Boundary: discount cap 80% (effectiveDiscount must be > 0 and <= 0.8).
 * These functions are pure — no DB access, no network, no side effects.
 */

import type { PromoEntry } from '../../infrastructure/vtex/promotions-client.js';
import type { PromoPriceResult } from '../../infrastructure/vtex/promotions-client.js';
import type { Promotion } from '../../shared/types.js';

export interface StrategyAResult {
  sku_id: string;
  offer_price: number;
  discount_pct: number;
  /** The promo's display name from search-promotions (e.g. "2do al 50% COCACOLA | Ofertas Trafico"). */
  name: string;
}

export interface StrategyBResult {
  offer_price: number;
  discount_pct: number;
}

/**
 * Apply Strategy A discount logic (from enricher.js enrichViaPromos inner loop).
 * Lines 106–117 in enricher.js — verbatim logic.
 *
 * Returns the update payload or null if the promo is rejected (discount out of bounds,
 * missing, or offerPrice not strictly less than rawPrice).
 */
export function effectiveDiscount(
  skuId: string,
  rawPrice: number,
  generic: Record<string, PromoEntry>,
): StrategyAResult | null {
  const promo = generic[skuId];
  if (!promo) return null;

  // FIXED-PRICE promo: VTEX states the exact sale price in `value`. Use it directly.
  // The `effectiveDiscount` field is a ROUNDED fraction (e.g. "0.46"), so
  // reconstructing the price from it is off by a few pesos — e.g. base 4650 with a
  // real fixed price of 2499 reconstructs to 4650*(1-0.46)=2511. Trust `value`.
  if (promo.discountType === 'fixed_price' && typeof promo.value === 'number' && promo.value > 0) {
    const offerPrice = Math.round(promo.value * 100) / 100;
    if (offerPrice >= rawPrice) return null;
    const discount = (rawPrice - offerPrice) / rawPrice;
    // Same stale-base guard as the percentage path (reject absurd >80% discounts).
    if (discount > 0.8) return null;
    return {
      sku_id: skuId,
      offer_price: offerPrice,
      discount_pct: Math.round(discount * 100),
      name: promo.name,
    };
  }

  // PERCENTAGE promo: reconstruct from effectiveDiscount (verbatim from enricher.js).
  const discount = Number.parseFloat(promo.effectiveDiscount);
  if (!discount || discount <= 0 || discount > 0.8) return null;

  // verbatim from enricher.js lines 111–112:
  const pct = Math.round(discount * 100);
  const offerPrice = Math.round(rawPrice * (1 - discount) * 100) / 100;

  // verbatim from enricher.js line 114:
  if (offerPrice >= rawPrice) return null;

  return { sku_id: skuId, offer_price: offerPrice, discount_pct: pct, name: promo.name };
}

/**
 * Parse a CONDITIONAL promo from a search-promotions name into a structured
 * nth-unit Promotion, or null when the promo is a flat discount.
 *
 * Conditional promos ("2do al 50% COCACOLA", "3x2 ...") become nth_unit promos
 * with min_qty + the per-Nth-unit discount_pct, so the frontend computes the
 * per-unit price and renders the same "$X c/u" badge as DIA/Carrefour. Flat
 * discounts ("35% MULTIMAX") return null — they are conveyed by the strike-through
 * price and need no badge. Mirrors the teaser-label math in the crawl normalizer:
 *   - NxM (N > M): min_qty = N, discount_pct = (N - M) * 100
 *   - "Ndo ... al X%": min_qty = N, discount_pct = X
 */
export function conditionalPromo(name: string | undefined): Promotion | null {
  if (!name) return null;

  const nxm = name.match(/(\d+)\s*x\s*(\d+)/i);
  if (nxm && Number(nxm[1]) > Number(nxm[2])) {
    const n = Number(nxm[1]);
    const m = Number(nxm[2]);
    return { label: `${n}x${m}`, type: 'nth_unit', min_qty: n, discount_pct: (n - m) * 100 };
  }

  // The ordinal suffix is REQUIRED so a bare flat "N al X%" never reads as nth_unit.
  const nth = name.match(/(\d+)\s*(?:do|da|er|ero|°|º)\s*(?:unidad\s+)?al\s*(\d+)\s*%/i);
  if (nth) {
    return {
      label: nth[0].replace(/\s+/g, ' ').trim(),
      type: 'nth_unit',
      min_qty: Number(nth[1]),
      discount_pct: Number(nth[2]),
    };
  }

  return null;
}

/**
 * Determine the effective offer price from a JSON-LD parse result (Strategy B).
 * From enricher.js enrichViaHtmlScraping inner loop, lines 183–188.
 *
 * Returns { offer_price, discount_pct } or null if promoPrice >= basePrice.
 */
export function offerPrice(rawPrice: number, parsed: PromoPriceResult): StrategyBResult | null {
  const { promoPrice, listPrice } = parsed;

  // verbatim from enricher.js line 184:
  const basePrice = listPrice != null && listPrice > promoPrice ? listPrice : rawPrice;

  // verbatim from enricher.js line 186:
  if (promoPrice >= basePrice) return null;

  // verbatim from enricher.js line 187:
  const pct = Math.round(((basePrice - promoPrice) / basePrice) * 100);
  return { offer_price: promoPrice, discount_pct: pct };
}

/**
 * Validate that a discount (as a decimal fraction) is within the allowed bounds.
 * Bounds mirror enricher.js: must be > 0 and <= 0.8.
 */
export function isValidDiscount(discount: number): boolean {
  return discount > 0 && discount <= 0.8;
}
