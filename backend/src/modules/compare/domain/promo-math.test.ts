import { describe, expect, it } from 'vitest';
import type { Promotion } from '../../../shared/types.js';
import { collectInfoBadges, effectiveLineTotal, pickBestNthUnitPromo } from './promo-math.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeNthUnit(min_qty: number, discount_pct: number, label = 'Promo'): Promotion {
  return { label, type: 'nth_unit', min_qty, discount_pct };
}

function makeOther(label: string): Promotion {
  return { label, type: 'other', min_qty: null, discount_pct: null };
}

// ─── effectiveLineTotal ───────────────────────────────────────────────────────

describe('effectiveLineTotal', () => {
  it('Q multiple of N: p=2470, N=2, D=80, Q=2 → 2964', () => {
    const promo = makeNthUnit(2, 80);
    // groups=1, rem=0 → 2470*(1*(2-0.8)+0) = 2470*1.2 = 2964
    expect(effectiveLineTotal(2470, promo, 2)).toBeCloseTo(2964, 5);
  });

  it('remainder: p=2470, N=2, D=80, Q=3 → 5434', () => {
    const promo = makeNthUnit(2, 80);
    // groups=1, rem=1 → 2470*(1*1.2+1) = 2470*2.2 = 5434
    expect(effectiveLineTotal(2470, promo, 3)).toBeCloseTo(5434, 5);
  });

  it('Q<N (Planner parity): p=2470, N=2, D=80, Q=1 → 2470', () => {
    const promo = makeNthUnit(2, 80);
    // groups=0, rem=1 → 2470*(0+1) = 2470
    expect(effectiveLineTotal(2470, promo, 1)).toBe(2470);
  });

  it('2x1 (D=100, N=2): Q=2 → unitPrice', () => {
    const promo = makeNthUnit(2, 100);
    // groups=1, d=1 → 2470*(1*(2-1)+0) = 2470*1 = 2470
    expect(effectiveLineTotal(2470, promo, 2)).toBe(2470);
  });

  it('2x1 (D=100, N=2): Q=3 → 2*unitPrice', () => {
    const promo = makeNthUnit(2, 100);
    // groups=1, rem=1 → 2470*(1*1+1) = 2470*2 = 4940
    expect(effectiveLineTotal(2470, promo, 3)).toBe(2470 * 2);
  });

  it('3x2 (D=100, N=3): Q=3 → 2*unitPrice', () => {
    const promo = makeNthUnit(3, 100);
    // groups=1, d=1 → 2470*(1*(3-1)+0) = 2470*2 = 4940
    expect(effectiveLineTotal(2470, promo, 3)).toBe(2470 * 2);
  });

  it('guard: undefined promo → unitPrice*qty', () => {
    expect(effectiveLineTotal(100, undefined, 3)).toBe(300);
  });

  it('guard: type="other" → unitPrice*qty', () => {
    const promo = makeOther('Other');
    expect(effectiveLineTotal(100, promo, 3)).toBe(300);
  });

  it('guard: min_qty=null → unitPrice*qty', () => {
    const promo: Promotion = { label: 'P', type: 'nth_unit', min_qty: null, discount_pct: 80 };
    expect(effectiveLineTotal(100, promo, 3)).toBe(300);
  });

  it('guard: min_qty=1 → unitPrice*qty', () => {
    const promo: Promotion = { label: 'P', type: 'nth_unit', min_qty: 1, discount_pct: 80 };
    expect(effectiveLineTotal(100, promo, 3)).toBe(300);
  });

  it('guard: discount_pct=null → unitPrice*qty', () => {
    const promo: Promotion = { label: 'P', type: 'nth_unit', min_qty: 2, discount_pct: null };
    expect(effectiveLineTotal(100, promo, 3)).toBe(300);
  });

  it('guard: discount_pct=0 → unitPrice*qty', () => {
    const promo: Promotion = { label: 'P', type: 'nth_unit', min_qty: 2, discount_pct: 0 };
    expect(effectiveLineTotal(100, promo, 3)).toBe(300);
  });

  it('guard: discount_pct=-5 → unitPrice*qty', () => {
    const promo: Promotion = { label: 'P', type: 'nth_unit', min_qty: 2, discount_pct: -5 };
    expect(effectiveLineTotal(100, promo, 3)).toBe(300);
  });

  // ── Over-discount guard ─────────────────────────────────────────────────────

  it('guard: discount_pct=150 → falls back to unitPrice*qty (not negative, not zero)', () => {
    const promo: Promotion = { label: 'P', type: 'nth_unit', min_qty: 2, discount_pct: 150 };
    const result = effectiveLineTotal(100, promo, 3);
    // Must equal unitPrice*qty; must NOT be negative or zero.
    expect(result).toBe(300);
    expect(result).toBeGreaterThan(0);
  });

  it('guard: discount_pct=200 → falls back to unitPrice*qty (not negative, not zero)', () => {
    const promo: Promotion = { label: 'P', type: 'nth_unit', min_qty: 2, discount_pct: 200 };
    const result = effectiveLineTotal(100, promo, 2);
    expect(result).toBe(200);
    expect(result).toBeGreaterThan(0);
  });

  // ── Quantity=0 self-defense ─────────────────────────────────────────────────

  it('quantity=0 → treated as 1 (self-defensive clamp), returns unitPrice*1', () => {
    // Internal Math.max(1, ...) ensures no zero total for 0-qty caller.
    expect(effectiveLineTotal(100, undefined, 0)).toBe(100);
    expect(effectiveLineTotal(100, makeNthUnit(2, 80), 0)).toBe(100);
  });
});

// ─── pickBestNthUnitPromo ─────────────────────────────────────────────────────

describe('pickBestNthUnitPromo', () => {
  it('picks the promo with the lowest effective total for given qty', () => {
    // At qty=4: promo A (N=2, D=80): groups=2, total=100*(2*1.2+0)=240
    //           promo B (N=4, D=50): groups=1, total=100*(1*(4-0.5)+0)=350
    // A is cheaper
    const promoA = makeNthUnit(2, 80, 'A');
    const promoB = makeNthUnit(4, 50, 'B');
    const result = pickBestNthUnitPromo([promoA, promoB], 100, 4);
    expect(result).toBe(promoA);
  });

  it('returns undefined for empty array', () => {
    expect(pickBestNthUnitPromo([], 100, 3)).toBeUndefined();
  });

  it('returns undefined when all promos are type "other"', () => {
    expect(pickBestNthUnitPromo([makeOther('Cuotas'), makeOther('Envío')], 100, 3)).toBeUndefined();
  });

  it('returns the nth_unit promo when mixed with other types', () => {
    const nth = makeNthUnit(2, 80, 'NthUnit');
    const other = makeOther('Other');
    const result = pickBestNthUnitPromo([other, nth], 100, 2);
    expect(result).toBe(nth);
  });

  it('filters out over-discount (>100) promos; only valid promo wins', () => {
    // discount_pct=150 is malformed — filter must exclude it, so the 80% promo wins.
    const bad: Promotion = { label: 'Bad', type: 'nth_unit', min_qty: 2, discount_pct: 150 };
    const good = makeNthUnit(2, 80, 'Good');
    const result = pickBestNthUnitPromo([bad, good], 100, 2);
    expect(result).toBe(good);
  });

  // ── Best-promo-only label (product decision) ────────────────────────────────
  // Product rule: when a product has multiple nth_unit promos, only the best
  // (lowest effective) label is surfaced as promo_label; the non-winner must NOT
  // appear in info_badges (info_badges is for 'other' type only).

  it('when two nth_unit promos exist, only the best label is returned — the other is not leaked', () => {
    // At qty=4: promo A (N=2, D=80) effective=240 (cheaper)
    //           promo B (N=4, D=50) effective=350 (more expensive)
    const promoA = makeNthUnit(2, 80, 'BestPromo');
    const promoB = makeNthUnit(4, 50, 'WorsePromo');

    const best = pickBestNthUnitPromo([promoA, promoB], 100, 4);
    // Only the best label is surfaced; caller uses best?.label as promo_label.
    expect(best?.label).toBe('BestPromo');

    // collectInfoBadges must NOT contain either nth_unit promo label.
    const badges = collectInfoBadges([promoA, promoB]);
    expect(badges).not.toContain('BestPromo');
    expect(badges).not.toContain('WorsePromo');
    expect(badges).toHaveLength(0);
  });
});

// ─── collectInfoBadges ────────────────────────────────────────────────────────

describe('collectInfoBadges', () => {
  it('returns only "other" labels in order', () => {
    const promotions: Promotion[] = [
      makeNthUnit(2, 80, '2do al 80%'),
      makeOther('Cuotas sin interés'),
      makeOther('Envío gratis'),
    ];
    expect(collectInfoBadges(promotions)).toEqual(['Cuotas sin interés', 'Envío gratis']);
  });

  it('returns [] for empty array', () => {
    expect(collectInfoBadges([])).toEqual([]);
  });

  it('returns [] when all promos are nth_unit', () => {
    expect(collectInfoBadges([makeNthUnit(2, 80)])).toEqual([]);
  });

  it('de-duplicates identical "other" labels', () => {
    // Duplicate labels must not produce duplicate React keys downstream.
    const promotions: Promotion[] = [
      makeOther('Cuotas sin interés'),
      makeOther('Cuotas sin interés'),
      makeOther('Envío gratis'),
    ];
    expect(collectInfoBadges(promotions)).toEqual(['Cuotas sin interés', 'Envío gratis']);
  });
});
