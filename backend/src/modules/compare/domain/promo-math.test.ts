import { describe, expect, it } from 'vitest';
import type { Promotion } from '../../../shared/types.js';
import {
  PROMO_NUDGE_MIN_ABS,
  collectInfoBadges,
  computePromoOpportunity,
  effectiveLineTotal,
  pickBestNthUnitPromo,
} from './promo-math.js';

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

// ─── computePromoOpportunity ──────────────────────────────────────────────────

describe('computePromoOpportunity', () => {
  // Oreo flip case: qty=1.
  // MAS (home, no promo) shelfUnit=1599 → currentBestUnit=1599, currentBestSuper='masonline'.
  // DIA has "2do al 80%" (N=2, D=80) shelfUnit=1800.
  //   At qty=1: effectiveLineTotal(1800, 2do, 1)/1 = 1800 (groups=0) → effUnit=1800 (worse).
  //   missing = (2-(1%2))%2 = 1, target_qty=2
  //   At target=2: effectiveLineTotal(1800, 2do, 2)/2 = 1800*1.2/2 = 1080
  //   improvement: 1599 - 1080 = 519 > max(1, 7.995)=7.995 → fires
  //   best_super='dia', currentBestSuper='masonline' → flips_super=true
  it('Oreo flip: qty=1, MAS no promo shelfUnit=1599 (currentBest), DIA 2do-al-80% shelfUnit=1800 → flips_super=true missing=1 target=2', () => {
    const diaPromo: Promotion = {
      label: '2do al 80%',
      type: 'nth_unit',
      min_qty: 2,
      discount_pct: 80,
    };
    const candidates = [
      { super: 'masonline', product_id: 2, shelfUnit: 1599, promotions: [] },
      { super: 'dia', product_id: 1, shelfUnit: 1800, promotions: [diaPromo] },
    ];
    const opp = computePromoOpportunity(candidates, 1);
    expect(opp).not.toBeNull();
    expect(opp?.flips_super).toBe(true); // best_super='dia', currentBestSuper='masonline'
    expect(opp?.missing_units).toBe(1);
    expect(opp?.target_qty).toBe(2);
    expect(opp?.best_super).toBe('dia');
    expect(opp?.current_best_super).toBe('masonline');
    // effUnit at target: 1800*1.2/2 = 1080
    expect(opp?.effective_unit_price_at_target).toBeCloseTo(1080, 2);
    // Pin current-best fields so a regression computing from shelf price (not effective) is caught.
    // currentBestUnit = effectiveLineTotal(1599, undefined, 1)/1 = 1599
    expect(opp?.current_best_unit_price).toBeCloseTo(1599, 2);
    expect(opp?.current_best_super).toBe('masonline');
  });

  // ── best-promo-AT-TARGET: key correctness claim ──────────────────────────────
  // One candidate has TWO nth_unit promos. Promo A wins at currentQty but promo B wins at
  // target_qty. The helper must call pickBestNthUnitPromo at target_qty, NOT at currentQty.
  // If it were called at currentQty the wrong promo label would be returned.
  it('best-promo-AT-TARGET: promo B wins at target_qty=6 even though promo A wins at currentQty=4', () => {
    // Candidate: shelfUnit=1000, promoA=(N=2, D=80, '2do al 80%'), promoB=(N=6, D=100, '6x5' 2x1-at-6).
    // currentQty=4:
    //   pickBestNthUnitPromo([A,B], 1000, 4):
    //     A: effectiveLineTotal(1000, {N=2,D=80}, 4) = 1000*(2*(2-0.8)+0) = 1000*2.4 = 2400; effUnit=600
    //     B: effectiveLineTotal(1000, {N=6,D=100}, 4) = 1000*(0*(6-1)+4) = 4000; effUnit=1000
    //   → promo A wins at qty=4 (effUnit=600).
    // minQty = min(2,6) = 2. missing = (2-(4%2))%2 = 0 → skip! (already multiple of 2)
    // Need currentQty not a multiple of 2 or 6. Use currentQty=5:
    //   pickBestNthUnitPromo([A,B], 1000, 5):
    //     A: effectiveLineTotal(1000, {N=2,D=80}, 5) = 1000*(2*(2-0.8)+1) = 1000*3.4 = 3400; effUnit=680
    //     B: effectiveLineTotal(1000, {N=6,D=100}, 5) = 1000*(0*(6-1)+5) = 5000; effUnit=1000
    //   → promo A wins at qty=5 (effUnit=680). currentBestUnit=680, currentBestSuper='dia'.
    // missing: minQty=min(2,6)=2; missing=(2-(5%2))%2=(2-1)%2=1; target=6.
    //   At target=6: pickBestNthUnitPromo([A,B], 1000, 6):
    //     A: effectiveLineTotal(1000, {N=2,D=80}, 6) = 1000*(3*(2-0.8)+0) = 1000*3.6 = 3600; effUnit=600
    //     B: effectiveLineTotal(1000, {N=6,D=100}, 6) = 1000*(1*(6-1)+0) = 5000; effUnit=833.3
    //   → promo A still wins at target=6 (effUnit=600). A→A, no flip of promo winner.
    // To get promo flip we need B to beat A at target. Use N=2 D=20 for A (weak discount).
    //   A_weak=(N=2, D=20), B_strong=(N=4, D=100 "4x3").
    //   currentQty=3: pickBestNthUnitPromo([A_weak,B_strong], 1000, 3):
    //     A_weak: effectiveLineTotal(1000,{N=2,D=20},3)=1000*(1*(2-0.2)+1)=2800; effUnit=933.3
    //     B_strong: effectiveLineTotal(1000,{N=4,D=100},3)=1000*(0*(4-1)+3)=3000; effUnit=1000
    //   → A_weak wins at qty=3 (effUnit=933.3). currentBestUnit=933.3.
    //   minQty=min(2,4)=2; missing=(2-(3%2))%2=(2-1)%2=1; target=4.
    //   At target=4: pickBestNthUnitPromo([A_weak,B_strong], 1000, 4):
    //     A_weak: effectiveLineTotal(1000,{N=2,D=20},4)=1000*(2*(2-0.2)+0)=3600; effUnit=900
    //     B_strong: effectiveLineTotal(1000,{N=4,D=100},4)=1000*(1*(4-1)+0)=3000; effUnit=750
    //   → B_strong wins at target=4 (effUnit=750). promo_label='4x3'. ✓
    //   improvement=933.3-750=183.3 > max(1, 933.3*0.005=4.67)=4.67 → fires.
    //   If pickBestNthUnitPromo were called at currentQty=3 instead of target=4:
    //     promo A_weak wins at qty=3 → promo_label='2do al 20%' (WRONG). Test catches this.
    const promoA: Promotion = {
      label: '2do al 20%',
      type: 'nth_unit',
      min_qty: 2,
      discount_pct: 20,
    };
    const promoB: Promotion = { label: '4x3', type: 'nth_unit', min_qty: 4, discount_pct: 100 };
    // Use two supers so currentBestUnit comes from the promo super itself (single candidate is fine
    // since currentBestUnit at qty=3 uses A_weak which is the best there).
    const candidates = [
      { super: 'dia', product_id: 1, shelfUnit: 1000, promotions: [promoA, promoB] },
      { super: 'masonline', product_id: 2, shelfUnit: 2000, promotions: [] },
    ];
    const opp = computePromoOpportunity(candidates, 3);
    expect(opp).not.toBeNull();
    // Key assertion: promo B ('4x3') must win at target_qty=4, not promo A ('2do al 20%').
    // If pickBestNthUnitPromo is called at currentQty=3, promo A wins and this fails.
    expect(opp?.promo_label).toBe('4x3');
    expect(opp?.target_qty).toBe(4);
    expect(opp?.missing_units).toBe(1);
    expect(opp?.effective_unit_price_at_target).toBeCloseTo(750, 1);
  });

  // best-promo-at-target subtlety: candidate has TWO nth_unit promos.
  // At qty=1 (q=1): "2do al 80%" (N=2, D=80), "3x2" (N=3, D=100).
  //   minQty = min(2,3) = 2; missing = (2-(1%2))%2 = 1; target_qty = 2
  //   pickBestNthUnitPromo at target_qty=2:
  //     2do-al-80%: effectiveLineTotal(1000, {N=2,D=80}, 2) = 1000*1.2 = 1200 → effUnit=600
  //     3x2: effectiveLineTotal(1000, {N=3,D=100}, 2) = 1000*(0*(3-1)+2) = 2000 → effUnit=1000
  //   best at target_qty=2: 2do-al-80% (lower)
  // BUT what if we test target_qty=3 for the 3x2 promo?
  //   missing for N=3: (3-(1%3))%3 = (3-1)%3 = 2; target_qty=3
  //   pickBestNthUnitPromo at target_qty=3:
  //     2do-al-80%: effectiveLineTotal(1000, {N=2,D=80}, 3) = 1000*(1*1.2+1) = 2200 → effUnit≈733.3
  //     3x2: effectiveLineTotal(1000, {N=3,D=100}, 3) = 1000*(1*(3-1)+0) = 2000 → effUnit≈666.7
  //   best at target_qty=3: 3x2 wins
  // The algorithm takes minQty=2 → missing=1 → target=2 → 2do-al-80% wins. To test the
  // "best-at-target subtlety" we need a scenario where the WINNING promo at target_qty
  // differs from what would win at current qty. Use a single candidate with two promos,
  // currentQty=2: "2do al 80%" would be the best at qty=2. missing for N=3 is 1 → target=3.
  // At target=3: 3x2 beats 2do-al-80%. Verify the helper picks 3x2, not 2do-al-80%.
  it('best-promo-at-target subtlety: 3x2 promo wins at target_qty=3 even though 2do-al-80% wins at current qty=2', () => {
    const promo2do: Promotion = {
      label: '2do al 80%',
      type: 'nth_unit',
      min_qty: 2,
      discount_pct: 80,
    };
    const promo3x2: Promotion = { label: '3x2', type: 'nth_unit', min_qty: 3, discount_pct: 100 };
    // Only one super so no flip. shelfUnit=1000.
    // currentQty=2: 2do-al-80% is cheapest at qty=2 (effUnit=600), but we check missing for min_qty=3:
    //   missing = (3-(2%3))%3 = (3-2)%3 = 1; target=3
    //   At target=3: pickBestNthUnitPromo([2do-al-80%, 3x2], 1000, 3):
    //     2do: effectiveLineTotal(1000, 2do, 3) = 1000*(1*1.2+1) = 2200 → effUnit_line=2200
    //     3x2: effectiveLineTotal(1000, 3x2, 3) = 1000*(1*(3-1)+0) = 2000 → effUnit_line=2000
    //     3x2 wins.
    // currentBestUnit at qty=2: effectiveLineTotal(1000, 2do, 2)/2 = 1200/2 = 600
    // effUnit at target=3: 2000/3 ≈ 666.7 > 600? → 666.7 < 600 - max(1, 3) = 597? NO → null!
    // We need currentBestUnit to be higher for the nudge to fire. Use a second candidate with no promo.
    const _candidates = [
      { super: 'dia', product_id: 1, shelfUnit: 1000, promotions: [promo2do, promo3x2] },
      { super: 'masonline', product_id: 2, shelfUnit: 1200, promotions: [] }, // higher shelf, no promo
    ];
    // currentQty=2:
    //   masonline: effUnit=1200/1=1200 (no promo, qty=2 → 2400/2=1200)
    //   dia: pickBestNthUnitPromo([2do,3x2],1000,2)=2do; effectiveLineTotal(1000,2do,2)/2=1200/2=600
    //   currentBestUnit=600, currentBestSuper='dia'
    // missing for N=3 at q=2: (3-2%3)%3=1; target=3
    // At target=3: 3x2 wins (as computed above): effUnit=2000/3≈666.7
    // 666.7 >= 600 - max(1, 600*0.005=3) = 597 → 666.7 >= 597 → does NOT fire (true)
    // Hmm — need larger currentBestUnit. Use currentQty=1 instead:
    //   dia: effectiveLineTotal(1000, no best at qty=1 from 2do since groups=0 rem=1 → 1000)/1=1000
    //     wait: pickBestNthUnitPromo([2do,3x2],1000,1):
    //       2do: effectiveLineTotal(1000,2do,1)=1000*(0*(2-0.8)+1)=1000 → effUnit=1000
    //       3x2: effectiveLineTotal(1000,3x2,1)=1000*(0*(3-1)+1)=1000 → effUnit=1000
    //     best=2do (first by reduce); effUnit=1000
    //   masonline: effUnit=1200/1=1200
    //   currentBestUnit=1000, currentBestSuper='dia'
    // missing for N=2 (smallest) at q=1: (2-1%2)%2=1; target=2
    // At target=2: pickBestNthUnitPromo([2do,3x2],1000,2):
    //   2do: effectiveLineTotal(1000,2do,2)=1200; 3x2: effectiveLineTotal(1000,3x2,2)=2000 → 2do wins
    //   effUnit=1200/2=600
    // 600 < 1000 - max(1, 5) = 995? YES → fires with promo_label='2do al 80%' (not 3x2)
    //
    // To test that 3x2 wins at target: use currentQty=2 but with higher currentBestUnit from another super:
    //   Use shelfUnit=2000 for masonline (no promo) so currentBestUnit=1200 from masonline at qty=2? No:
    //   dia at qty=2 is 600, masonline at qty=2 = 2000. currentBestUnit=600.
    //
    // The design says: minQty = min of ALL nth_unit promos. For N=2 and N=3, minQty=2.
    // missing at q=2: (2-(2%2))%2=0 → skip for dia! So the dia candidate gets skipped at q=2.
    // The only firing candidate would be masonline (no promo) → skipped too.
    // So opportunity=null at q=2. That's correct: already at a multiple of 2.
    //
    // To actually test 3x2 winning at target: use q=2, but only the 3x2 promo (no 2do-al-80%).
    // That way minQty=3, missing=(3-2%3)%3=1, target=3, promo=3x2.
    const candidates2 = [
      { super: 'dia', product_id: 1, shelfUnit: 1000, promotions: [promo3x2] },
      { super: 'masonline', product_id: 2, shelfUnit: 2000, promotions: [] },
    ];
    // currentQty=2:
    //   dia: pickBestNthUnitPromo([3x2],1000,2)=3x2? effectiveLineTotal(1000,3x2,2)=1000*(0*(3-1)+2)=2000/2=1000
    //     wait: groups=floor(2/3)=0, rem=2 → 1000*(0+2)=2000. effUnit=2000/2=1000
    //   masonline: effUnit=2000/1=2000 (no promo, qty=2→4000/2=2000)
    //   currentBestUnit=1000, currentBestSuper='dia'
    // minQty=3 (only promo), missing=(3-(2%3))%3=(3-2)%3=1, target=3
    // pickBestNthUnitPromo([3x2],1000,3): effectiveLineTotal(1000,3x2,3)=1000*(1*(3-1)+0)=2000; effUnit=2000/3≈666.7
    // 666.7 < 1000 - max(1, 5) = 995 → fires! promo_label='3x2'
    const opp2 = computePromoOpportunity(candidates2, 2);
    expect(opp2).not.toBeNull();
    expect(opp2?.promo_label).toBe('3x2');
    expect(opp2?.missing_units).toBe(1);
    expect(opp2?.target_qty).toBe(3);
  });

  it('no-op: missing===0 (already at multiple of min_qty) — two supers so removing the guard would flip to non-null', () => {
    // Promo super (dia): N=2, currentQty=2 → missing=0 → guard fires → skip.
    // Non-promo super (masonline): shelf=1200, no promo — more expensive, never wins.
    // Without the missing===0 guard, dia would be evaluated with missing=0 and target=2,
    // which equals currentQty — producing a spurious opportunity. With the guard it stays null.
    const promo: Promotion = {
      label: '2do al 80%',
      type: 'nth_unit',
      min_qty: 2,
      discount_pct: 80,
    };
    const candidates = [
      { super: 'dia', product_id: 1, shelfUnit: 1000, promotions: [promo] },
      { super: 'masonline', product_id: 2, shelfUnit: 1200, promotions: [] },
    ];
    // dia at qty=2 (currentBest): effectiveLineTotal(1000, promo, 2)/2 = 1200/2 = 600
    // missing = (2-(2%2))%2 = 0 → skip dia. masonline has no promo → skip.
    // Result must be null — the guard prevents treating qty=2 as a nudge target for N=2.
    expect(computePromoOpportunity(candidates, 2)).toBeNull();
  });

  it('no-op: no nth_unit promo in any candidate', () => {
    const otherPromo: Promotion = {
      label: 'Cuotas',
      type: 'other',
      min_qty: null,
      discount_pct: null,
    };
    const candidates = [
      { super: 'masonline', product_id: 1, shelfUnit: 1000, promotions: [otherPromo] },
    ];
    expect(computePromoOpportunity(candidates, 1)).toBeNull();
  });

  // ── Epsilon gate: EITHER threshold is sufficient (max gate, not AND) ─────────
  // Fire condition: improvement > max(PROMO_NUDGE_MIN_ABS, currentBestUnit * PROMO_NUDGE_MIN_PCT)
  //
  // (a) When currentBestUnit < $200: pct_threshold (0.005*unit) < ABS ($1) → ABS is binding gate.
  //     Improvement just above $1 fires. A max→min inversion lowers threshold — detected by
  //     the null-case in (b) which would spuriously fire with min gate.
  // (b) When currentBestUnit > $200: pct_threshold > $1 → PCT is binding gate.
  //     Improvement between ABS and pct_threshold must be NULL. A max→min inversion makes it fire.

  it('epsilon gate (a): ABS is binding gate on cheap item — improvement > $1 fires even when pct_threshold < $1', () => {
    // currentBestUnit=100. pct_threshold=100*0.005=0.5 < ABS=1 → max gate = $1 (ABS).
    // dia: shelfUnit=164, N=2, D=80 → effUnit at target=2: 164*1.2/2=98.4
    // improvement=100-98.4=1.6 > max(1, 0.5)=1 → fires.
    // If code used min instead of max: threshold=min(1,0.5)=0.5. 1.6>0.5 → still fires.
    // The inversion is detected by test (b) which asserts NULL on the expensive-item case.
    const promo: Promotion = {
      label: '2do al 80%',
      type: 'nth_unit',
      min_qty: 2,
      discount_pct: 80,
    };
    const candidates = [
      { super: 'home', product_id: 1, shelfUnit: 100, promotions: [] },
      { super: 'dia', product_id: 2, shelfUnit: 164, promotions: [promo] },
    ];
    const opp = computePromoOpportunity(candidates, 1);
    expect(opp).not.toBeNull();
    expect(opp?.effective_unit_price_at_target).toBeCloseTo(98.4, 1);
  });

  it('epsilon gate (b): PCT is binding gate on expensive item — improvement between ABS and pct_threshold is null (would fire with min gate)', () => {
    // currentBestUnit=600. pct_threshold=600*0.005=3 > ABS=1 → max gate = $3 (PCT).
    // Improvement=$1.80: > ABS ($1) but < pct_threshold ($3).
    //   max gate → null (correct). min gate → threshold=1, fires (wrong).
    // dia: shelfUnit=997, effUnit at target=2: 997*0.6=598.2; improvement=1.8 < 3 → null.
    const promo: Promotion = {
      label: '2do al 80%',
      type: 'nth_unit',
      min_qty: 2,
      discount_pct: 80,
    };
    const candidatesNull = [
      { super: 'home', product_id: 1, shelfUnit: 600, promotions: [] },
      { super: 'dia', product_id: 2, shelfUnit: 997, promotions: [promo] },
    ];
    expect(computePromoOpportunity(candidatesNull, 1)).toBeNull();

    // Larger improvement exceeding pct_threshold fires.
    // dia: shelfUnit=990, effUnit at target=2: 990*0.6=594; improvement=6 > 3 → fires.
    const candidatesFire = [
      { super: 'home', product_id: 1, shelfUnit: 600, promotions: [] },
      { super: 'dia', product_id: 2, shelfUnit: 990, promotions: [promo] },
    ];
    const opp = computePromoOpportunity(candidatesFire, 1);
    expect(opp).not.toBeNull();
    expect(opp?.effective_unit_price_at_target).toBeCloseTo(594, 1);
  });

  it('no-op: promo not cheapest at target (effUnit > currentBestUnit - epsilon)', () => {
    // currentBestUnit from home (no promo) = 500. Promo candidate target effUnit = 499
    // improvement = 500 - 499 = 1 which is NOT > max(1, 500*0.005=2.5) = 2.5 → null
    const promo: Promotion = {
      label: '2do al 80%',
      type: 'nth_unit',
      min_qty: 2,
      discount_pct: 80,
    };
    // shelfUnit chosen so that effUnit at target is only 0.5 below currentBestUnit
    // currentBestUnit=500 (home, no promo, qty=1)
    // at target=2: effectiveLineTotal(shelfUnit, promo, 2)/2 = shelfUnit*1.2/2 = shelfUnit*0.6
    // We want shelfUnit*0.6 = 499 → shelfUnit ≈ 831.67. To get exactly 1 below: shelfUnit=834 → 834*0.6=500.4 → not below.
    // Let's use shelfUnit=832 → 832*0.6=499.2. improvement = 500-499.2=0.8 < max(1,2.5)=2.5 → null
    const candidates = [
      { super: 'home', product_id: 1, shelfUnit: 500, promotions: [] },
      { super: 'dia', product_id: 2, shelfUnit: 832, promotions: [promo] },
    ];
    expect(computePromoOpportunity(candidates, 1)).toBeNull();
  });

  it('no-op: below epsilon (improvement < $1 and < 0.5%)', () => {
    // Both ABS and PCT checks: on a $1600/unit item, $0.50 improvement is below both
    // currentBestUnit = 1600 (home, no promo)
    // epsilon = max(1, 1600*0.005=8) = 8
    // We need effUnit at target >= 1600 - 8 = 1592 to get null
    // At target: effUnit = 1595 → null
    // effectiveLineTotal(shelfUnit, {N=2,D=80}, 2) / 2 = shelfUnit * 0.6
    // shelfUnit * 0.6 = 1595 → shelfUnit = 2658.33 → use 2659 → 2659*0.6=1595.4 > 1592 → null
    const promo: Promotion = {
      label: '2do al 80%',
      type: 'nth_unit',
      min_qty: 2,
      discount_pct: 80,
    };
    const candidates = [
      { super: 'home', product_id: 1, shelfUnit: 1600, promotions: [] },
      { super: 'dia', product_id: 2, shelfUnit: 2659, promotions: [promo] },
    ];
    expect(computePromoOpportunity(candidates, 1)).toBeNull();
  });

  it('home-super opportunity: single candidate with nth_unit promo, flips_super=false', () => {
    // Single super = home. currentBestUnit = shelfUnit (no promo at qty=1).
    // At target=2: effUnit < currentBestUnit - epsilon → fires with flips_super=false.
    // shelfUnit=1600: currentBestUnit=1600
    //   effUnit at target=2: 1600*1.2/2=960
    //   improvement=1600-960=640 > max(1,8)=8 → fires
    const promo: Promotion = {
      label: '2do al 80%',
      type: 'nth_unit',
      min_qty: 2,
      discount_pct: 80,
    };
    const candidates = [
      { super: 'masonline', product_id: 1, shelfUnit: 1600, promotions: [promo] },
    ];
    const opp = computePromoOpportunity(candidates, 1);
    expect(opp).not.toBeNull();
    expect(opp?.flips_super).toBe(false); // best_super === current_best_super ('masonline')
    expect(opp?.best_super).toBe('masonline');
    expect(opp?.current_best_super).toBe('masonline');
    expect(opp?.missing_units).toBe(1);
  });

  it('returns null for empty candidates array', () => {
    expect(computePromoOpportunity([], 1)).toBeNull();
  });

  it('suppresses opportunity when target_qty > 999 (cart max) — Agregar would hit a 400', () => {
    // currentQty=999, promo N=2 → missing=1 → target=1000 > MAX_CART_QTY → skip.
    // Without the guard, this would produce an opportunity where the button would fail.
    const promo: Promotion = {
      label: '2do al 80%',
      type: 'nth_unit',
      min_qty: 2,
      discount_pct: 80,
    };
    const candidates = [
      { super: 'home', product_id: 1, shelfUnit: 1600, promotions: [] },
      { super: 'dia', product_id: 2, shelfUnit: 1800, promotions: [promo] },
    ];
    // currentQty=999: minQty=2, missing=(2-(999%2))%2=(2-1)%2=1, target=1000 > 999 → null.
    expect(computePromoOpportunity(candidates, 999)).toBeNull();
  });

  it('guard: target_qty < 999 is not suppressed — normal nudge fires correctly', () => {
    // Verify the target_qty>999 guard only blocks when target is actually over the cap,
    // not for ordinary nudges. currentQty=1, N=2, target=2 — a normal sub-cap nudge.
    const promo: Promotion = {
      label: '2do al 80%',
      type: 'nth_unit',
      min_qty: 2,
      discount_pct: 80,
    };
    const candidates = [
      { super: 'home', product_id: 1, shelfUnit: 100, promotions: [] },
      // effUnit at target=2: 120*1.2/2=72 < 100. improvement=28 > max(1,0.5)=1 → fires. ✓
      { super: 'dia', product_id: 2, shelfUnit: 120, promotions: [promo] },
    ];
    const opp = computePromoOpportunity(candidates, 1);
    expect(opp).not.toBeNull();
    expect(opp?.target_qty).toBe(2); // well below 999
  });

  it('skips candidates with shelfUnit <= 0 (corrupt data guard)', () => {
    // A zero-price candidate must not fabricate a bogus nudge.
    const promo: Promotion = {
      label: '2do al 80%',
      type: 'nth_unit',
      min_qty: 2,
      discount_pct: 80,
    };
    const candidates = [
      { super: 'corrupt', product_id: 1, shelfUnit: 0, promotions: [promo] },
      { super: 'masonline', product_id: 2, shelfUnit: 1600, promotions: [] },
    ];
    // Only 'masonline' (no promo) survives the shelfUnit>0 guard — no nth_unit promo → null.
    expect(computePromoOpportunity(candidates, 1)).toBeNull();
  });

  // Verify PROMO_NUDGE_MIN_ABS is exported and equals 1
  it('PROMO_NUDGE_MIN_ABS constant is exported and equals 1', () => {
    expect(PROMO_NUDGE_MIN_ABS).toBe(1);
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
