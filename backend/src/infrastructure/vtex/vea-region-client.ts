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

/**
 * Resolve the VEA region for a location: nearest VEA sucursal (SEPA) → seller
 * slug (regions) → regionId. Returns null when no VEA store is near or the
 * seller cannot be matched, so callers leave region_ids.vea null (default region).
 */
export async function resolveVeaRegion(
  baseUrl: string,
  geo: GeoPoint,
  postalCode = '1000',
): Promise<{ regionId: string; store: StoreLocation } | null> {
  const sucursal = await getVeaSucursalNear(geo);
  if (!sucursal) return null;

  const map = await getVeaSellerMap(baseUrl, postalCode);
  const slug = map.get(Number(sucursal.storeNumber));
  if (!slug) return null;

  const regionId = regionIdForSellers([slug]);
  if (!regionId) return null;

  return {
    regionId,
    store: { sellerId: slug, name: sucursal.name, city: sucursal.city, state: sucursal.state },
  };
}
