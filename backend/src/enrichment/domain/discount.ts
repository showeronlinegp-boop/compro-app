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

export interface StrategyAResult {
  sku_id: string;
  offer_price: number;
  discount_pct: number;
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

  // verbatim from enricher.js line 108:
  const discount = Number.parseFloat(promo.effectiveDiscount);
  if (!discount || discount <= 0 || discount > 0.8) return null;

  // verbatim from enricher.js lines 111–112:
  const pct = Math.round(discount * 100);
  const offerPrice = Math.round(rawPrice * (1 - discount) * 100) / 100;

  // verbatim from enricher.js line 114:
  if (offerPrice >= rawPrice) return null;

  return { sku_id: skuId, offer_price: offerPrice, discount_pct: pct };
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
