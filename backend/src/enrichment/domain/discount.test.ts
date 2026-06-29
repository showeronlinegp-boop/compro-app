/**
 * discount.test.ts — Characterization test for the TS enrichment discount module.
 *
 * Re-pointed from the in-test adapter copy (Task 4.10) to the real TS modules:
 *   src/enrichment/domain/discount.ts     → effectiveDiscount, offerPrice
 *   src/infrastructure/vtex/promotions-client.ts → parseJsonLdFromHtml
 *
 * Snapshot values are IDENTICAL to the baseline (Task 4.10 / Slice 4).
 * Only describe-block names changed: "LEGACY enricher" → "TS enricher".
 */

import * as nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = nodePath.dirname(__filename);

import * as fs from 'node:fs';
// ── fixtures ──────────────────────────────────────────────────────────────────
import promotionsVea from '../../infrastructure/vtex/__fixtures__/promotions-vea.json' with {
  type: 'json',
};

import { parseJsonLdFromHtml } from '../../infrastructure/vtex/promotions-client.js';
import type { PromoPriceResult } from '../../infrastructure/vtex/promotions-client.js';
import { conditionalPromo, effectiveDiscount, offerPrice } from './discount.js';

const FIXTURES_DIR = nodePath.resolve(__dirname, '../../infrastructure/vtex/__fixtures__');

// ─────────────────────────────────────────────────────────────────────────────

describe('TS enricher — Strategy A (search-promotions) characterization', () => {
  it('applies effectiveDiscount from promotions fixture — snapshot all results', () => {
    const generic = promotionsVea.promotions.generic?.promotions ?? {};

    // Build synthetic product records using the SKU IDs from the fixture
    const skuIds = Object.keys(generic);
    expect(skuIds.length).toBeGreaterThan(0);

    const results = skuIds.map((skuId) => effectiveDiscount(skuId, 10000, generic));
    expect(results).toMatchSnapshot();
  });

  it('rejects effectiveDiscount > 0.8 (80% cap)', () => {
    const badPromo = { 'test-sku': { effectiveDiscount: '0.85', ref_id: '', name: '', type: '' } };
    expect(effectiveDiscount('test-sku', 1000, badPromo)).toBeNull();
  });

  it('rejects effectiveDiscount = 0', () => {
    const zeroPromo = { 'test-sku': { effectiveDiscount: '0', ref_id: '', name: '', type: '' } };
    expect(effectiveDiscount('test-sku', 1000, zeroPromo)).toBeNull();
  });

  it('rejects effectiveDiscount < 0', () => {
    const negPromo = { 'test-sku': { effectiveDiscount: '-0.1', ref_id: '', name: '', type: '' } };
    expect(effectiveDiscount('test-sku', 1000, negPromo)).toBeNull();
  });

  it('accepts effectiveDiscount exactly 0.8 (boundary)', () => {
    const boundary = { 'test-sku': { effectiveDiscount: '0.8', ref_id: '', name: '', type: '' } };
    const result = effectiveDiscount('test-sku', 1000, boundary);
    expect(result).not.toBeNull();
    expect(result?.discount_pct).toBe(80);
    expect(result?.offer_price).toBe(200);
  });

  it('rejects when offerPrice >= rawPrice (safety guard)', () => {
    // effectiveDiscount=0.1 but raw_price=0 → offerPrice=0 which is not < raw_price=0
    const promo = { 'test-sku': { effectiveDiscount: '0.1', ref_id: '', name: '', type: '' } };
    expect(effectiveDiscount('test-sku', 0, promo)).toBeNull();
  });

  it('real fixture sku 336191 — fixed_price uses exact value 619 (not reconstructed)', () => {
    // 336191 is a fixed_price promo (value 619, effectiveDiscount 0.37). At its real
    // base (~983) the exact sale price is 619; the old code reconstructed it from the
    // rounded 0.37 and got it wrong. Use a realistic base so the fixed_price path applies.
    const generic = promotionsVea.promotions.generic?.promotions ?? {};
    const result = effectiveDiscount('336191', 983, generic);
    expect(result?.offer_price).toBe(619); // exact value, not 983*(1-0.37)=619.29
    expect(result?.discount_pct).toBe(37); // round((983-619)/983*100)
  });

  describe('fixed_price promos use the exact `value`, not the rounded effectiveDiscount', () => {
    it('uses value (2499) directly instead of reconstructing 4650*(1-0.46)=2511', () => {
      const promo = {
        '3082542': {
          ref_id: '590801',
          name: 'OFERTA YOG LS | Ofertas Trafico',
          type: 'regular',
          discountType: 'fixed_price',
          value: 2499,
          effectiveDiscount: '0.46', // rounded — would give 2511 if trusted
        },
      };
      const result = effectiveDiscount('3082542', 4650, promo);
      expect(result?.offer_price).toBe(2499);
      expect(result?.discount_pct).toBe(46); // round((4650-2499)/4650*100)
    });

    it('rejects a fixed_price whose value is not below the base price', () => {
      const promo = {
        sku: { ref_id: '', name: 'x', type: 'regular', discountType: 'fixed_price', value: 5000, effectiveDiscount: '0.1' },
      };
      expect(effectiveDiscount('sku', 4650, promo)).toBeNull();
    });

    it('falls back to effectiveDiscount when discountType is not fixed_price', () => {
      // value present but it is NOT a price for a percentage promo → must be ignored.
      const promo = {
        sku: { ref_id: '', name: 'x', type: 'regular', discountType: 'percentual', value: 46, effectiveDiscount: '0.40' },
      };
      const result = effectiveDiscount('sku', 1000, promo);
      expect(result?.offer_price).toBe(600); // 1000*(1-0.40), value:46 ignored
      expect(result?.discount_pct).toBe(40);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('TS enricher — Strategy B (JSON-LD scraping) characterization', () => {
  it('dia fixture: parses lowPrice from AggregateOffer (snapshot)', () => {
    const html = fs.readFileSync(nodePath.join(FIXTURES_DIR, 'jsonld-dia-25417.html'), 'utf-8');
    const result = parseJsonLdFromHtml(html);

    // dia fixture has AggregateOffer.lowPrice=1575 (no offers.price at top level)
    expect(result).not.toBeNull();
    expect(result).toMatchSnapshot();
  });

  it('carrefour fixture: returns null (no ld+json — client-side rendered)', () => {
    const html = fs.readFileSync(
      nodePath.join(FIXTURES_DIR, 'jsonld-carrefour-1751946.html'),
      'utf-8',
    );
    const result = parseJsonLdFromHtml(html);

    // Carrefour renders JSON-LD client-side; fixture has no ld+json blocks
    expect(result).toBeNull();
  });

  it('applyStrategyBDiscount: uses listPrice as basePrice when listPrice > promoPrice', () => {
    const result = offerPrice(5000, { promoPrice: 3000, listPrice: 6000 } as PromoPriceResult);
    // basePrice = listPrice=6000 (> promoPrice=3000)
    // pct = round((6000 - 3000) / 6000 * 100) = 50
    expect(result).not.toBeNull();
    expect(result?.discount_pct).toBe(50);
    expect(result?.offer_price).toBe(3000);
    expect(result).toMatchSnapshot();
  });

  it('applyStrategyBDiscount: uses rawPrice as basePrice when listPrice is null', () => {
    const result = offerPrice(5000, { promoPrice: 4000, listPrice: null } as PromoPriceResult);
    // basePrice = rawPrice=5000
    // pct = round((5000 - 4000) / 5000 * 100) = 20
    expect(result).not.toBeNull();
    expect(result?.discount_pct).toBe(20);
    expect(result?.offer_price).toBe(4000);
    expect(result).toMatchSnapshot();
  });

  it('applyStrategyBDiscount: uses rawPrice when listPrice < promoPrice', () => {
    // listPrice=1000 < promoPrice=3000 → use rawPrice=5000 as base
    const result = offerPrice(5000, { promoPrice: 3000, listPrice: 1000 } as PromoPriceResult);
    const basePrice = 5000; // listPrice (1000) is NOT > promoPrice (3000) → use rawPrice
    const pct = Math.round(((basePrice - 3000) / basePrice) * 100);
    expect(result).not.toBeNull();
    expect(result?.discount_pct).toBe(pct);
    expect(result).toMatchSnapshot();
  });

  it('applyStrategyBDiscount: returns null when promoPrice >= rawPrice', () => {
    expect(offerPrice(1000, { promoPrice: 1000, listPrice: null } as PromoPriceResult)).toBeNull();
    expect(offerPrice(1000, { promoPrice: 1200, listPrice: null } as PromoPriceResult)).toBeNull();
  });

  it('parseJsonLdPromoPrice: prefers offers.price over offers.lowPrice', () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@type":"Product","offers":{"price":999,"lowPrice":800}}</script>
    </head></html>`;
    const result = parseJsonLdFromHtml(html);
    expect(result?.promoPrice).toBe(999); // offers.price wins
  });

  it('parseJsonLdPromoPrice: falls back to offers.lowPrice when no offers.price', () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@type":"Product","offers":{"lowPrice":750}}</script>
    </head></html>`;
    const result = parseJsonLdFromHtml(html);
    expect(result?.promoPrice).toBe(750);
    expect(result?.listPrice).toBeNull();
  });

  it('parseJsonLdPromoPrice: skips malformed JSON blocks', () => {
    const html = `<html><head>
      <script type="application/ld+json">{ invalid json }</script>
      <script type="application/ld+json">{"@type":"Product","offers":{"price":500}}</script>
    </head></html>`;
    const result = parseJsonLdFromHtml(html);
    // First block is malformed, should skip to second block
    expect(result?.promoPrice).toBe(500);
  });
});

describe('conditionalPromo — VEA search-promotions name → nth_unit promo', () => {
  it('parses a 2nd-unit percentage promo into nth_unit (min_qty 2, discount_pct 50)', () => {
    expect(conditionalPromo('2do al 50% COCACOLA | Ofertas Trafico')).toEqual({
      label: '2do al 50%',
      type: 'nth_unit',
      min_qty: 2,
      discount_pct: 50,
    });
  });

  it('parses a buy-N-pay-M promo (3x2 → min_qty 3, discount_pct 100)', () => {
    expect(conditionalPromo('3x2 GASEOSAS | Ofertas Trafico')).toEqual({
      label: '3x2',
      type: 'nth_unit',
      min_qty: 3,
      discount_pct: 100,
    });
  });

  it('returns null for a flat percentage discount (covered by the strike-through)', () => {
    expect(conditionalPromo('35% MULTIMAX | Ofertas Trafico')).toBeNull();
  });

  it('ignores a size token like 2x500ml (N not > M)', () => {
    expect(conditionalPromo('Pack 2x500ml')).toBeNull();
  });

  it('returns null for an empty or missing name', () => {
    expect(conditionalPromo('')).toBeNull();
    expect(conditionalPromo(undefined)).toBeNull();
  });
});
