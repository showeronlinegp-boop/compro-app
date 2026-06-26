import type { Promotion, PromoOpportunity } from '../../../shared/types.js';

// ─── Promo nudge epsilon constants ────────────────────────────────────────────

/** Minimum absolute improvement per unit (ARS) to trigger a nudge. */
export const PROMO_NUDGE_MIN_ABS = 1;
/** Minimum relative improvement (fraction of current best unit price) to trigger a nudge. */
export const PROMO_NUDGE_MIN_PCT = 0.005;

// ─── Internal candidate type ──────────────────────────────────────────────────

interface OpportunityCandidate {
  super: string;
  product_id: number;
  shelfUnit: number;
  promotions: Promotion[];
}

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

/**
 * Compute the single best promo nudge opportunity across a set of super candidates.
 *
 * For each candidate, determines if adding `missing` units would trigger an nth_unit
 * promo that makes the per-unit price at `target_qty` cheaper than the current best
 * effective unit price across all candidates at `currentQty`. Returns the candidate
 * with the largest improvement (lowest effective unit at target), or null if no
 * candidate meets the epsilon threshold.
 *
 * Key correctness points:
 *   - `currentBestUnit` uses `pickBestNthUnitPromo` at `currentQty` (not shelf price).
 *   - The promo at `target_qty` is re-evaluated with `pickBestNthUnitPromo(promos, shelfUnit, target_qty)`
 *     because a DIFFERENT promo may win at the higher quantity.
 *   - Epsilon: improvement must be > $1/unit OR > 0.5% of current best to suppress centavo-noise.
 */
export function computePromoOpportunity(
  candidates: OpportunityCandidate[],
  currentQty: number,
): PromoOpportunity | null {
  const q = Math.max(1, Math.floor(currentQty));

  // ── Step 1: compute current best effective unit price over all candidates ────
  let currentBestUnit = Infinity;
  let currentBestSuper = '';
  for (const c of candidates) {
    const best = pickBestNthUnitPromo(c.promotions, c.shelfUnit, q);
    const effUnit = effectiveLineTotal(c.shelfUnit, best, q) / q;
    if (effUnit < currentBestUnit) {
      currentBestUnit = effUnit;
      currentBestSuper = c.super;
    }
  }

  if (!isFinite(currentBestUnit)) return null; // no candidates

  // ── Step 2: find the candidate with the best effective unit at target_qty ────
  let bestEffUnit = Infinity;
  let bestCandidate: OpportunityCandidate | null = null;
  let bestMissing = 0;
  let bestTargetQty = 0;
  let bestAtTarget: Promotion | undefined;

  for (const c of candidates) {
    // Filter to nth_unit promos only (valid ones — same guard as pickBestNthUnitPromo)
    const nthUnitPromos = c.promotions.filter(
      (p) =>
        p.type === 'nth_unit' &&
        (p.min_qty ?? 0) >= 2 &&
        (p.discount_pct ?? 0) > 0 &&
        (p.discount_pct as number) <= 100,
    );

    if (nthUnitPromos.length === 0) continue;

    // Find the smallest min_qty among this candidate's nth_unit promos
    const minQty = Math.min(...nthUnitPromos.map((p) => p.min_qty as number));
    const missing = (minQty - (q % minQty)) % minQty;

    // missing === 0 means we are already at a multiple — no nudge needed
    if (missing === 0) continue;

    const targetQty = q + missing;

    // Re-evaluate: which promo wins AT target_qty (may differ from current qty winner)
    const promoAtTarget = pickBestNthUnitPromo(c.promotions, c.shelfUnit, targetQty);
    if (!promoAtTarget) continue; // no valid promo applies even at target_qty

    const effUnit = effectiveLineTotal(c.shelfUnit, promoAtTarget, targetQty) / targetQty;

    if (effUnit < bestEffUnit) {
      bestEffUnit = effUnit;
      bestCandidate = c;
      bestMissing = missing;
      bestTargetQty = targetQty;
      bestAtTarget = promoAtTarget;
    }
  }

  if (!bestCandidate || !isFinite(bestEffUnit)) return null;

  // ── Step 3: epsilon gate ─────────────────────────────────────────────────────
  const threshold = currentBestUnit - Math.max(PROMO_NUDGE_MIN_ABS, currentBestUnit * PROMO_NUDGE_MIN_PCT);
  if (bestEffUnit >= threshold) return null;

  return {
    shopping_id: bestCandidate.product_id, // caller overwrites this with s.item_id
    missing_units: bestMissing,
    target_qty: bestTargetQty,
    best_super: bestCandidate.super,
    best_product_id: bestCandidate.product_id,
    effective_unit_price_at_target: bestEffUnit,
    current_best_unit_price: currentBestUnit,
    current_best_super: currentBestSuper,
    flips_super: bestCandidate.super !== currentBestSuper,
    promo_label: bestAtTarget?.label ?? '',
  };
}
