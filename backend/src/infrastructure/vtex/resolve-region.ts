/**
 * resolve-region.ts — resolve the per-super VTEX regionIds (and nearby stores)
 * for a geographic point.
 *
 * Shared by the profile location endpoint (persists to a user's profile) and
 * the ops CLI (`--cp` flag), so zone → regionId resolution stays identical
 * everywhere. This is the reusable building block the multi-region feature will
 * use to crawl each supported zone.
 *
 * Pricing is zone-based: the regionId is base64("SW#"+all nearby store sellers),
 * so it reflects the full set of stores serving the area, not one store.
 * VEA/Cencosud exposes no VTEX pickup-points, so it is resolved separately via
 * resolveVeaRegion (SEPA nearest store + /regions seller list).
 */

import { SUPERS } from '../../config/supers.js';
import type { RegionIds, StoreMap, SuperKey } from '../../shared/types.js';
import type { GeoPoint } from '../geocode.js';
import { getStoresNear, regionIdForSellers } from './stores-client.js';
import { resolveVeaRegion } from './vea-region-client.js';

export async function resolveRegionForGeo(
  geo: GeoPoint,
): Promise<{ regionIds: RegionIds; stores: StoreMap }> {
  const keys = Object.keys(SUPERS) as SuperKey[];
  const lists = await Promise.all(keys.map((key) => getStoresNear(SUPERS[key].baseUrl, geo)));

  const stores: StoreMap = {};
  const regionIds: RegionIds = {};
  keys.forEach((key, i) => {
    const found = lists[i] ?? [];
    stores[key] = found.map((s) => ({
      sellerId: s.sellerId,
      name: s.name,
      city: s.city,
      state: s.state,
    }));
    regionIds[key] = regionIdForSellers(found.map((s) => s.sellerId));
  });

  // VEA has no pickup-points → resolve its zone seller via SEPA + /regions.
  if (!regionIds.vea) {
    const vea = await resolveVeaRegion(SUPERS.vea.baseUrl, geo);
    if (vea) {
      regionIds.vea = vea.regionId;
      stores.vea = [vea.store];
    }
  }

  return { regionIds, stores };
}
