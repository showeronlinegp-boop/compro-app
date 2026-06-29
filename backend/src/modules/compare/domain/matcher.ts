import type { CompareItem, CompareResult, SuperSummary } from '../../../shared/types.js';
import { round2 } from './round.js';

export function calcOptionA(items: CompareItem[]): SuperSummary[] {
  // Only in-stock matches count: an out-of-stock super is never a place we send
  // the user to buy, so it neither earns a row nor covers an item.
  const inStock = (m: CompareItem['matches'][number]) => m.available !== false;
  const supers = [...new Set(items.flatMap((i) => i.matches.filter(inStock).map((m) => m.super)))];

  return supers
    .map((sup) => {
      let total = 0;
      let missing = 0;
      for (const item of items) {
        const match = item.matches.find((m) => m.super === sup && inStock(m));
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
    // Out-of-stock supers cannot win an item — exclude them before picking best.
    const candidates = item.matches.filter((m) => m.available !== false);
    if (candidates.length === 0) continue;
    const best = candidates.reduce((a, b) => (a.price <= b.price ? a : b));
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
