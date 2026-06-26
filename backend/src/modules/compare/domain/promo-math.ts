import type { Promotion } from '../../../shared/types.js';

/**
 * Exact effective LINE total for an nth_unit promo at a given quantity.
 *
 * Guard (no promo | type!=='nth_unit' | min_qty<2 | discount_pct<=0) → unitPrice*qty.
 * Otherwise: unitPrice * (floor(qty/N)*(N - D) + qty%N), N=min_qty, D=discount_pct/100.
 */
export function effectiveLineTotal(
  unitPrice: number,
  promo: Promotion | undefined,
  quantity: number,
): number {
  const q = Math.max(0, Math.floor(quantity));
  if (
    !promo ||
    promo.type !== 'nth_unit' ||
    (promo.min_qty ?? 0) < 2 ||
    (promo.discount_pct ?? 0) <= 0
  ) {
    return unitPrice * q;
  }
  const n = promo.min_qty as number;
  const d = (promo.discount_pct as number) / 100;
  const groups = Math.floor(q / n);
  const remainder = q % n;
  return unitPrice * (groups * (n - d) + remainder);
}

/**
 * Pick the nth_unit promo yielding the LOWEST effective line total at qty.
 * Returns undefined when none apply.
 */
export function pickBestNthUnitPromo(
  promotions: Promotion[],
  unitPrice: number,
  qty: number,
): Promotion | undefined {
  return promotions
    .filter((p) => p.type === 'nth_unit' && (p.min_qty ?? 0) >= 2 && (p.discount_pct ?? 0) > 0)
    .reduce<Promotion | undefined>((best, p) => {
      if (!best) return p;
      return effectiveLineTotal(unitPrice, p, qty) < effectiveLineTotal(unitPrice, best, qty)
        ? p
        : best;
    }, undefined);
}

/** Labels of informational ('other') promos — never folded into ranking. */
export function collectInfoBadges(promotions: Promotion[]): string[] {
  return promotions.filter((p) => p.type === 'other').map((p) => p.label);
}
