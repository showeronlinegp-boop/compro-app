/**
 * simulation-client.test.ts — Unit tests for parseSimulation and
 * fetchSimulationPromos outcome classification.
 *
 * Fixtures mirror real masonline checkout-simulation responses observed in the
 * 2026-06 audit (prices in integer cents):
 *   - Oreo 118g at qty 2: no flat discount, "PromoVolumen - LLEVANDO 2 - 2da al 70%".
 *   - Aceite Cocinero 1.5L: flat ListPrice discount (6469 → 4851.75), no promo.
 *   - Regional seller that does not sell the SKU: items[0] has no price.
 *
 * Also asserts the end-to-end parse: the raw benefit label flows through the
 * existing conditionalPromo() into the right nth_unit promo.
 */

import { describe, expect, it, vi } from 'vitest';
import { conditionalPromo } from '../../enrichment/domain/discount.js';
import { fetchSimulationPromos, parseSimulation } from './simulation-client.js';

function makeResponse(ok: boolean, status: number, body: unknown): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const SIM_VOLUME_PROMO = {
  items: [{ price: 227900, listPrice: 227900, sellingPrice: 148135, quantity: 2 }],
  ratesAndBenefitsData: {
    rateAndBenefitsIdentifiers: [
      { name: 'PromoVolumen - LLEVANDO 2 - 2da al 70% - Reg-2-70 - GALLETITAS DULCES Y RELLENAS FINDE' },
    ],
  },
};

const SIM_FLAT_DISCOUNT = {
  items: [{ price: 485175, listPrice: 646900, sellingPrice: 485175, quantity: 2 }],
  ratesAndBenefitsData: { rateAndBenefitsIdentifiers: [] },
};

const SIM_UNSELLABLE = {
  items: [{ quantity: 2 }],
  ratesAndBenefitsData: null,
};

describe('parseSimulation', () => {
  it('extracts the volume-promo benefit name and converts cents to currency', () => {
    const r = parseSimulation(SIM_VOLUME_PROMO);
    expect(r.unitPrice).toBe(2279);
    expect(r.listPrice).toBe(2279);
    expect(r.benefitNames).toEqual([
      'PromoVolumen - LLEVANDO 2 - 2da al 70% - Reg-2-70 - GALLETITAS DULCES Y RELLENAS FINDE',
    ]);
  });

  it('reads a flat discount (price < listPrice) with no benefits', () => {
    const r = parseSimulation(SIM_FLAT_DISCOUNT);
    expect(r.unitPrice).toBe(4851.75);
    expect(r.listPrice).toBe(6469);
    expect(r.benefitNames).toEqual([]);
  });

  it('returns null prices when the seller does not sell the SKU', () => {
    const r = parseSimulation(SIM_UNSELLABLE);
    expect(r.unitPrice).toBeNull();
    expect(r.listPrice).toBeNull();
    expect(r.benefitNames).toEqual([]);
  });

  it('is defensive against an empty/garbage body', () => {
    expect(parseSimulation(null)).toEqual({ unitPrice: null, listPrice: null, benefitNames: [] });
    expect(parseSimulation({})).toEqual({ unitPrice: null, listPrice: null, benefitNames: [] });
  });

  it('end-to-end: the volume-promo label parses to a 2da-al-70 nth_unit promo', () => {
    const r = parseSimulation(SIM_VOLUME_PROMO);
    const promo = conditionalPromo(r.benefitNames[0]);
    expect(promo).toEqual({
      label: '2da al 70%',
      type: 'nth_unit',
      min_qty: 2,
      discount_pct: 70,
    });
    // per-unit at qty 2 = raw * (n - pct/100) / n = 2279 * 1.3 / 2 = 1481.35
    const perUnit = (r.listPrice as number) * (2 - 70 / 100) / 2;
    expect(perUnit).toBeCloseTo(1481.35, 2);
  });
});

describe('fetchSimulationPromos', () => {
  it('returns found with parsed result on 2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse(true, 200, SIM_VOLUME_PROMO)),
    );
    const out = await fetchSimulationPromos('https://x', '189283', '1', 2);
    expect(out.kind).toBe('found');
    if (out.kind === 'found') expect(out.result.benefitNames.length).toBe(1);
    vi.unstubAllGlobals();
  });

  it('maps non-2xx to fetch_error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(false, 500, {})));
    const out = await fetchSimulationPromos('https://x', '1', '1', 2);
    expect(out.kind).toBe('fetch_error');
    vi.unstubAllGlobals();
  });

  it('maps a network throw to fetch_error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')));
    const out = await fetchSimulationPromos('https://x', '1', '1', 2);
    expect(out.kind).toBe('fetch_error');
    vi.unstubAllGlobals();
  });
});
