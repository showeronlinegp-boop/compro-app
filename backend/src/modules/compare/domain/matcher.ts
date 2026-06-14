import type { CompareItem, CompareResult, SuperSummary } from '../../../shared/types.js';

export function calcOptionA(items: CompareItem[]): SuperSummary[] {
  const supers = [...new Set(items.flatMap((i) => i.matches.map((m) => m.super)))];

  return supers
    .map((sup) => {
      let total = 0;
      let missing = 0;
      for (const item of items) {
        const match = item.matches.find((m) => m.super === sup);
        if (match) {
          total += match.price;
        } else {
          missing++;
        }
      }
      const coverage = items.length > 0 ? ((items.length - missing) / items.length) * 100 : 0;
      return {
        super: sup,
        total: round2(total),
        coverage: Math.round(coverage),
        missing_items: missing,
      };
    })
    .sort((a, b) => {
      // Prefer higher coverage, then lower total
      if (b.coverage !== a.coverage) return b.coverage - a.coverage;
      return a.total - b.total;
    });
}

export function calcOptionB(items: CompareItem[]): CompareResult['option_b'] {
  const bySuperTotal = new Map<string, number>();
  const breakdown: CompareResult['option_b']['breakdown'] = [];
  let total = 0;

  for (const item of items) {
    if (item.matches.length === 0) continue;
    const best = item.matches.reduce((a, b) => (a.price <= b.price ? a : b));
    total += best.price;
    bySuperTotal.set(best.super, (bySuperTotal.get(best.super) ?? 0) + best.price);
    breakdown.push({ shopping_id: item.shopping_id, best_super: best.super, price: best.price });
  }

  const by_super: SuperSummary[] = [...bySuperTotal.entries()]
    .map(([sup, tot]) => ({
      super: sup,
      total: round2(tot),
      coverage: 100,
      missing_items: 0,
    }))
    .sort((a, b) => b.total - a.total);

  return { total: round2(total), by_super, breakdown, savings_vs_option_a: 0 };
}

export function buildCompareResult(items: CompareItem[]): CompareResult {
  const option_a = calcOptionA(items);
  const option_b_raw = calcOptionB(items);

  const cheapest_a = option_a[0]?.total ?? 0;
  const savings_vs_option_a = round2(Math.max(0, cheapest_a - option_b_raw.total));

  return {
    items,
    option_a,
    option_b: { ...option_b_raw, savings_vs_option_a },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
