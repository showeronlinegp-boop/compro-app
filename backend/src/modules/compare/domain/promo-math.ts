import type { Promotion } from '../../../shared/types.js';

/**
 * Exact effective LINE total for an nth_unit promo at a given quantity.
 *
 * Encoding convention used throughout this module:
 *   - DB stores `discount_pct` as an integer percentage in [1, 100].
 *   - 2x1  → discount_pct=100 on the 2nd unit (N=2): you pay 1 unit for every 2.
 *   - 3x2  → discount_pct=100 on the 3rd unit (N=3): you pay 2 units for every 3.
 *   - "2do al 80%" → discount_pct=80 on the 2nd unit (N=2).
 *   - effectiveLineTotal divides discount_pct by 100 to get the fractional discount
 *     (discountFraction), then applies it to (floor(qty/N) full groups) while
 *     charging the remainder at full price.
 *
 * Guards (no promo applied → unitPrice*qty):
 *   - promo is undefined
 *   - type !== 'nth_unit'
 *   - min_qty < 2
 *   - discount_pct not in (0, 100] — i.e. <= 0 OR > 100 (malformed/over-discount)
 */
export function effectiveLineTotal(
  unitPrice: number,
  promo: Promotion | undefined,
  quantity: number,
): number {
  // Clamp quantity to at least 1 so a future caller passing 0 still gets a valid total.
  const q = Math.max(1, Math.floor(quantity));
  if (
    !promo ||
    promo.type !== 'nth_unit' ||
    (promo.min_qty ?? 0) < 2 ||
    (promo.discount_pct ?? 0) <= 0 ||
    (promo.discount_pct as number) > 100 // guard: over-discount (150%, 200%, etc.) → no promo
  ) {
    return unitPrice * q;
  }
  const n = promo.min_qty as number;
  // discountFraction: DB stores discount_pct as an integer percentage → divide by 100
  const discountFraction = (promo.discount_pct as number) / 100;
  const groups = Math.floor(q / n);
  const remainder = q % n;
  // Each group of N units costs: N units at full price minus the discount on the Nth unit.
  // Remainder units are always full price.
  return unitPrice * (groups * (n - discountFraction) + remainder);
}

/**
 * Pick the nth_unit promo yielding the LOWEST effective line total at qty.
 * Returns undefined when none apply.
 *
 * Product decision: only the BEST (lowest-effective) promo label is surfaced as
 * `promo_label`; non-winning nth_unit promos are not leaked into info_badges.
 */
export function pickBestNthUnitPromo(
  promotions: Promotion[],
  unitPrice: number,
  qty: number,
): Promotion | undefined {
  return promotions
    .filter(
      (p) =>
        p.type === 'nth_unit' &&
        (p.min_qty ?? 0) >= 2 &&
        (p.discount_pct ?? 0) > 0 &&
        (p.discount_pct as number) <= 100, // mirror the guard in effectiveLineTotal
    )
    .reduce<Promotion | undefined>((best, p) => {
      if (!best) return p;
      return effectiveLineTotal(unitPrice, p, qty) < effectiveLineTotal(unitPrice, best, qty)
        ? p
        : best;
    }, undefined);
}

/** Labels of informational ('other') promos — never folded into ranking. Deduplicated. */
export function collectInfoBadges(promotions: Promotion[]): string[] {
  const labels = promotions.filter((p) => p.type === 'other').map((p) => p.label);
  // De-duplicate so identical 'other' labels don't produce duplicate React keys downstream.
  return [...new Set(labels)];
}
