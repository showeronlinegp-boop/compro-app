/**
 * simulation-client.ts — VTEX checkout orderForm simulation.
 *
 * Strategy "simulation": POST /api/checkout/pub/orderForms/simulation for a single
 * SKU at a given cart quantity. This is the ONLY endpoint that exposes VTEX
 * "PromoVolumen" quantity promos (e.g. "2da al 70%") for stores that hide them from
 * the IS-API teasers AND from search-promotions (confirmed for masonline). It also
 * carries the flat catalog discount (items[].price vs items[].listPrice).
 *
 * Prices in the checkout API are integer cents — parseSimulation divides by 100.
 */

import { UA } from '../../config/throttles.js';

// ---------------------------------------------------------------------------
// Parsed shape (pure — exported for unit testing)
// ---------------------------------------------------------------------------

export interface SimulationParse {
  /** Unconditional discounted unit price (items[0].price / 100). null if absent. */
  unitPrice: number | null;
  /** Strike-through unit price (items[0].listPrice / 100). null if absent. */
  listPrice: number | null;
  /** Promotion identifier names from ratesAndBenefitsData.rateAndBenefitsIdentifiers. */
  benefitNames: string[];
}

/**
 * Discriminated outcome for fetchSimulationPromos.
 *
 * - fetch_error: network threw, HTTP non-2xx, or unparseable body.
 * - found:       simulated ok; result carries prices + benefit names (any may be empty).
 */
export type SimulationOutcome = { kind: 'fetch_error' } | { kind: 'found'; result: SimulationParse };

interface SimItem {
  price?: number;
  listPrice?: number;
}
interface SimResponse {
  items?: SimItem[];
  ratesAndBenefitsData?: {
    rateAndBenefitsIdentifiers?: Array<{ name?: string }>;
  } | null;
}

/**
 * Parse a checkout simulation response into a SimulationParse.
 *
 * - unitPrice/listPrice come from the FIRST item (we simulate one SKU per call).
 *   A regional seller that does not sell the SKU returns price=null → both stay null.
 * - benefitNames are the non-empty identifier names; an empty list means no promo.
 *
 * Pure — no network. The downstream enricher decides nth_unit vs flat using the
 * existing conditionalPromo()/offerPrice() domain functions.
 */
export function parseSimulation(json: unknown): SimulationParse {
  const r = (json ?? {}) as SimResponse;
  const item = r.items?.[0];
  const cents = (v: number | undefined): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v / 100 : null;

  const benefitNames = (r.ratesAndBenefitsData?.rateAndBenefitsIdentifiers ?? [])
    .map((b) => b?.name)
    .filter((n): n is string => typeof n === 'string' && n.length > 0);

  return {
    unitPrice: cents(item?.price),
    listPrice: cents(item?.listPrice),
    benefitNames,
  };
}

/**
 * POST the orderForm simulation for one SKU at the given quantity.
 *
 * `seller` must be the seller that actually sells the SKU — for masonline that is
 * the marketplace default "1" (regional sellers return null prices and no promo).
 * Returns { kind: 'fetch_error' } on any network/HTTP/parse failure — identical
 * fail-closed semantics to fetchSearchPromotions.
 */
export async function fetchSimulationPromos(
  baseUrl: string,
  sku: string,
  seller: string,
  quantity: number,
): Promise<SimulationOutcome> {
  try {
    const res = await fetch(`${baseUrl}/api/checkout/pub/orderForms/simulation?sc=1`, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ items: [{ id: sku, quantity, seller }] }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { kind: 'fetch_error' };
    return { kind: 'found', result: parseSimulation(await res.json()) };
  } catch {
    return { kind: 'fetch_error' };
  }
}
