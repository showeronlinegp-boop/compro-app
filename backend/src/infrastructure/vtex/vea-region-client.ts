/**
 * vea-region-client.ts — Resolve VEA's per-zone VTEX region (seller) for pricing.
 *
 * VEA/Cencosud exposes no VTEX pickup-points, so getStoresNear() yields nothing
 * and VEA falls back to the national default region — wrong prices and catalog.
 * The fix is a two-source join, keyed on the STORE NUMBER:
 *
 *   1. SEPA gives the nearest VEA sucursal to the user's coords + its number.
 *   2. /regions?sc=34 returns ALL VEA seller slugs nationwide (postalCode is
 *      ignored — it is the master list, not a filter). Each slug is
 *      "jumboargentinav<number><localidad>" (e.g. jumboargentinav669pergamino).
 *
 * Matching on the number (not the localidad suffix, which is arbitrary — store
 * 402 is "patricia", not "mendoza") yields the real seller for the zone. Its
 * regionId then drives a region-accurate IS crawl, exactly like the other supers.
 */

import type { StoreLocation } from '../../shared/types.js';
import type { GeoPoint } from '../geocode.js';
import { getVeaSucursalNear } from '../sepa/sepa-client.js';
import { regionIdForSellers } from './stores-client.js';

const VEA_SALES_CHANNEL = 34; // VEA's VTEX sales channel — sc=1 returns no sellers.

interface RegionsResponseItem {
  id: string;
  sellers?: Array<{ id: string; name?: string }>;
}

// The full national seller list is stable; cache it for the process lifetime.
let cachedSellerMap: Map<number, string> | null = null;

/**
 * Map of VEA store number → VTEX seller slug, built from /regions?sc=34.
 * Cached after first success; a failed fetch returns an empty map without caching.
 */
export async function getVeaSellerMap(
  baseUrl: string,
  postalCode = '1000',
): Promise<Map<number, string>> {
  if (cachedSellerMap) return cachedSellerMap;

  const map = new Map<number, string>();
  try {
    // postalCode defaults to '1000' — endpoint ignores it
    const url = `${baseUrl}/api/checkout/pub/regions?country=ARG&postalCode=${encodeURIComponent(postalCode)}&sc=${VEA_SALES_CHANNEL}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return map;
    const data = (await res.json()) as RegionsResponseItem[];
    for (const region of Array.isArray(data) ? data : []) {
      for (const seller of region.sellers ?? []) {
        const n = Number(seller.id.match(/^jumboargentinav(\d+)/)?.[1]);
        if (Number.isFinite(n) && !map.has(n)) map.set(n, seller.id);
      }
    }
  } catch {
    return map;
  }

  if (map.size > 0) cachedSellerMap = map;
  return map;
}

/** Number of attempts for each flaky external step (SEPA, /regions). */
const RESOLVE_ATTEMPTS = 3;
const RESOLVE_DELAY_MS = 600;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Call `fn` up to `attempts` times until `ok(result)` holds, with a linear backoff.
 * Used to ride out transient failures of the flaky SEPA / /regions endpoints
 * (rate-limit HTML pages, 5xx) that otherwise return null/empty on the first try.
 */
async function retryUntil<T>(fn: () => Promise<T>, ok: (v: T) => boolean): Promise<T> {
  let result = await fn();
  for (let attempt = 1; attempt < RESOLVE_ATTEMPTS && !ok(result); attempt++) {
    await sleep(RESOLVE_DELAY_MS * attempt);
    result = await fn();
  }
  return result;
}

/**
 * Resolve the VEA region for a location: nearest VEA sucursal (SEPA) → seller
 * slug (regions) → regionId. Returns null when no VEA store is near or the seller
 * cannot be matched, so callers leave region_ids.vea null (default region).
 *
 * Both external steps (SEPA, /regions) are flaky and previously failed SILENTLY:
 * a single transient failure left region_ids.vea null forever (resolution runs
 * once at location-set time and is then persisted). We now RETRY each step and
 * WARN with the exact failing step on a definitive null, so the failure is visible
 * instead of silently degrading VEA to the default (CABA) region.
 */
export async function resolveVeaRegion(
  baseUrl: string,
  geo: GeoPoint,
  postalCode = '1000',
): Promise<{ regionId: string; store: StoreLocation } | null> {
  const sucursal = await retryUntil(() => getVeaSucursalNear(geo), (s) => s != null);
  if (!sucursal) {
    console.warn(
      `[vea-region] SEPA no devolvió una sucursal VEA cerca de (${geo.lat},${geo.lng}) tras ${RESOLVE_ATTEMPTS} intentos — VEA quedará en la región DEFAULT. Reintentá guardar la ubicación.`,
    );
    return null;
  }

  const map = await retryUntil(() => getVeaSellerMap(baseUrl, postalCode), (m) => m.size > 0);
  if (map.size === 0) {
    console.warn(
      `[vea-region] /regions devolvió un mapa de sellers vacío tras ${RESOLVE_ATTEMPTS} intentos — VEA quedará en la región DEFAULT. Reintentá guardar la ubicación.`,
    );
    return null;
  }

  const slug = map.get(Number(sucursal.storeNumber));
  if (!slug) {
    console.warn(
      `[vea-region] La sucursal VEA ${sucursal.storeNumber} (${sucursal.city ?? '?'}) no matchea ningún seller (mapa de ${map.size}) — VEA quedará en la región DEFAULT.`,
    );
    return null;
  }

  const regionId = regionIdForSellers([slug]);
  if (!regionId) return null;

  return {
    regionId,
    store: { sellerId: slug, name: sucursal.name, city: sucursal.city, state: sucursal.state },
  };
}
