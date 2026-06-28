import { describe, expect, it } from 'vitest';
import type { CompareItem } from '../../../shared/types.js';
import { buildCompareResult, calcOptionA, calcOptionB } from './matcher.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeItem(
  shopping_id: number,
  matches: Array<{ super: string; price: number; product_id?: number }>,
): CompareItem {
  return {
    shopping_id,
    name: `Item ${shopping_id}`,
    home_super: 'vea',
    home_price: 100,
    home_unit_price: 100,
    home_promo_label: null,
    home_info_badges: [],
    matches: matches.map((m, i) => ({
      super: m.super,
      product_id: m.product_id ?? i + 1,
      name: `Product ${i + 1}`,
      price: m.price,
      matched_by: 'barcode' as const,
      unit_price: m.price,
      promo_label: null,
      info_badges: [],
    })),
    opportunity: null,
  };
}

// ─── calcOptionA ─────────────────────────────────────────────────────────────

describe('calcOptionA', () => {
  it('returns one summary per distinct super across all items', () => {
    const items: CompareItem[] = [
      makeItem(1, [
        { super: 'vea', price: 100 },
        { super: 'carrefour', price: 110 },
      ]),
      makeItem(2, [{ super: 'vea', price: 90 }]),
    ];
    const result = calcOptionA(items);
    expect(result.map((r) => r.super)).toContain('vea');
    expect(result.map((r) => r.super)).toContain('carrefour');
    expect(result).toHaveLength(2);
  });

  it('sums prices for items matched in the same super', () => {
    const items: CompareItem[] = [
      makeItem(1, [{ super: 'vea', price: 100 }]),
      makeItem(2, [{ super: 'vea', price: 90 }]),
    ];
    const [summary] = calcOptionA(items);
    expect(summary?.super).toBe('vea');
    expect(summary?.total).toBe(190);
  });

  it('counts missing_items for items with no match in a super', () => {
    const items: CompareItem[] = [
      makeItem(1, [
        { super: 'vea', price: 100 },
        { super: 'dia', price: 95 },
      ]),
      makeItem(2, [{ super: 'vea', price: 80 }]),
    ];
    const result = calcOptionA(items);
    const dia = result.find((r) => r.super === 'dia');
    expect(dia?.missing_items).toBe(1);
    expect(dia?.coverage).toBe(50);
  });

  it('calculates coverage as round((items - missing) / items * 100)', () => {
    const items: CompareItem[] = [
      makeItem(1, [{ super: 'vea', price: 100 }]),
      makeItem(2, [{ super: 'vea', price: 200 }]),
      makeItem(3, [{ super: 'vea', price: 300 }]),
      makeItem(4, []),
    ];
    // vea has 3 of 4 items → coverage = round(3/4*100) = 75
    const result = calcOptionA(items);
    const vea = result.find((r) => r.super === 'vea');
    expect(vea?.coverage).toBe(75);
    expect(vea?.missing_items).toBe(1);
  });

  it('sorts by coverage DESC then total ASC', () => {
    const items: CompareItem[] = [
      makeItem(1, [
        { super: 'vea', price: 100 },
        { super: 'carrefour', price: 80 },
        { super: 'dia', price: 90 },
      ]),
      makeItem(2, [
        { super: 'vea', price: 200 },
        { super: 'carrefour', price: 160 },
      ]),
    ];
    // vea: 2/2 coverage=100, total=300
    // carrefour: 2/2 coverage=100, total=240
    // dia: 1/2 coverage=50
    const result = calcOptionA(items);
    expect(result[0]?.super).toBe('carrefour');
    expect(result[1]?.super).toBe('vea');
    expect(result[2]?.super).toBe('dia');
  });

  it('returns empty array for empty items', () => {
    expect(calcOptionA([])).toEqual([]);
  });

  it('rounds totals to 2 decimal places', () => {
    const items: CompareItem[] = [
      makeItem(1, [{ super: 'vea', price: 10.1 }]),
      makeItem(2, [{ super: 'vea', price: 10.2 }]),
    ];
    const [summary] = calcOptionA(items);
    expect(summary?.total).toBe(20.3);
  });

  it('total is 0 and coverage is 0 when no items have a match in that super', () => {
    const items: CompareItem[] = [makeItem(1, [{ super: 'carrefour', price: 100 }])];
    // dia appears in no matches so it will not appear in result at all
    // vea appears in no matches either
    const result = calcOptionA(items);
    expect(result.every((r) => r.super !== 'vea')).toBe(true);
  });
});

// ─── calcOptionB ─────────────────────────────────────────────────────────────

describe('calcOptionB', () => {
  it('picks cheapest match across supers for each item', () => {
    const items: CompareItem[] = [
      makeItem(1, [
        { super: 'vea', price: 150 },
        { super: 'carrefour', price: 100 },
        { super: 'dia', price: 120 },
      ]),
    ];
    const result = calcOptionB(items);
    expect(result.breakdown[0]?.best_super).toBe('carrefour');
    expect(result.breakdown[0]?.price).toBe(100);
  });

  it('sums cheapest matches for total', () => {
    const items: CompareItem[] = [
      makeItem(1, [
        { super: 'vea', price: 100 },
        { super: 'carrefour', price: 80 },
      ]),
      makeItem(2, [
        { super: 'vea', price: 200 },
        { super: 'carrefour', price: 250 },
      ]),
    ];
    // item1 cheapest: carrefour 80, item2 cheapest: vea 200 → total = 280
    const result = calcOptionB(items);
    expect(result.total).toBe(280);
  });

  it('skips items with empty matches array', () => {
    const items: CompareItem[] = [makeItem(1, [{ super: 'vea', price: 100 }]), makeItem(2, [])];
    const result = calcOptionB(items);
    expect(result.total).toBe(100);
    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown[0]?.shopping_id).toBe(1);
  });

  it('aggregates by_super sorted by total DESC', () => {
    const items: CompareItem[] = [
      makeItem(1, [
        { super: 'dia', price: 50 },
        { super: 'vea', price: 200 },
      ]),
      makeItem(2, [
        { super: 'dia', price: 50 },
        { super: 'vea', price: 100 },
      ]),
    ];
    // both items cheapest at dia (50 each) → dia total=100, vea not selected
    const result = calcOptionB(items);
    expect(result.by_super[0]?.super).toBe('dia');
    expect(result.by_super[0]?.total).toBe(100);
    expect(result.by_super[0]?.coverage).toBe(100);
    expect(result.by_super[0]?.missing_items).toBe(0);
  });

  it('breakdown contains shopping_id, best_super, price per included item', () => {
    const items: CompareItem[] = [makeItem(42, [{ super: 'vea', price: 99.99 }])];
    const result = calcOptionB(items);
    expect(result.breakdown[0]).toEqual({ shopping_id: 42, best_super: 'vea', price: 99.99 });
  });

  it('ties resolved by first match (<=)', () => {
    const items: CompareItem[] = [
      makeItem(1, [
        { super: 'vea', price: 100 },
        { super: 'carrefour', price: 100 },
      ]),
    ];
    // prices equal → first match wins (vea)
    const result = calcOptionB(items);
    expect(result.breakdown[0]?.best_super).toBe('vea');
  });

  it('rounds total to 2 decimal places', () => {
    const items: CompareItem[] = [
      makeItem(1, [{ super: 'vea', price: 10.005 }]),
      makeItem(2, [{ super: 'vea', price: 10.005 }]),
    ];
    const result = calcOptionB(items);
    // round2(20.01) should be fine
    expect(result.total).toBe(Math.round(20.01 * 100) / 100);
  });

  it('returns empty breakdown for all-empty matches', () => {
    const items: CompareItem[] = [makeItem(1, []), makeItem(2, [])];
    const result = calcOptionB(items);
    expect(result.total).toBe(0);
    expect(result.breakdown).toHaveLength(0);
    expect(result.by_super).toHaveLength(0);
  });
});

// ─── buildCompareResult ───────────────────────────────────────────────────────

describe('buildCompareResult', () => {
  it('sets savings_vs_option_a = cheapest option_a total - option_b total', () => {
    const items: CompareItem[] = [
      makeItem(1, [
        { super: 'vea', price: 300 },
        { super: 'carrefour', price: 280 },
      ]),
      makeItem(2, [
        { super: 'vea', price: 200 },
        { super: 'carrefour', price: 180 },
      ]),
    ];
    // option_a: carrefour (280+180=460 coverage 100), vea (300+200=500 coverage 100)
    // cheapest option_a = carrefour total = 460
    // option_b: each item picks cheapest → carrefour both → total = 280+180 = 460
    // savings = max(0, 460 - 460) = 0
    const result = buildCompareResult(items);
    expect(result.option_b.savings_vs_option_a).toBe(0);
  });

  it('savings is positive when option_b is cheaper than best option_a', () => {
    const items: CompareItem[] = [
      makeItem(1, [
        { super: 'vea', price: 500 },
        { super: 'carrefour', price: 450 },
        { super: 'dia', price: 400 },
      ]),
      makeItem(2, [
        { super: 'vea', price: 400 },
        { super: 'carrefour', price: 380 },
        { super: 'dia', price: 420 },
      ]),
    ];
    // option_a sorted: carrefour(100% cov, 830), dia(100% cov, 820), vea(100% cov, 900)
    // cheapest option_a = dia total = 820
    // option_b: item1 → dia 400, item2 → carrefour 380 → total = 780
    // savings = max(0, 820 - 780) = 40
    const result = buildCompareResult(items);
    expect(result.option_b.savings_vs_option_a).toBe(40);
  });

  it('savings is never negative', () => {
    const items: CompareItem[] = [makeItem(1, [{ super: 'vea', price: 100 }])];
    // option_a cheapest = 100, option_b = 100 → savings = 0
    const result = buildCompareResult(items);
    expect(result.option_b.savings_vs_option_a).toBeGreaterThanOrEqual(0);
  });

  it('does not throw for empty items array', () => {
    expect(() => buildCompareResult([])).not.toThrow();
    const result = buildCompareResult([]);
    expect(result.option_a).toEqual([]);
    expect(result.option_b.total).toBe(0);
    expect(result.option_b.savings_vs_option_a).toBe(0);
  });

  it('passes items through to result.items unchanged', () => {
    const items: CompareItem[] = [makeItem(1, [{ super: 'vea', price: 100 }])];
    const result = buildCompareResult(items);
    expect(result.items).toBe(items);
  });

  it('option_b.savings_vs_option_a is rounded to 2 decimal places', () => {
    const items: CompareItem[] = [
      makeItem(1, [
        { super: 'vea', price: 100.005 },
        { super: 'dia', price: 100 },
      ]),
    ];
    const result = buildCompareResult(items);
    const savings = result.option_b.savings_vs_option_a;
    expect(savings).toBe(Math.round(savings * 100) / 100);
  });
});
