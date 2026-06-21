/**
 * stores-client.ts — Resolve physical stores near a location, per super.
 *
 * Uses VTEX's pickup-points endpoint (physical stores near coords), NOT the
 * delivery-regions endpoint: a store can exist in a city even when the online
 * shop doesn't deliver there (e.g. DIA Pergamino — 0 delivery sellers but 9
 * pickup stores). Each store maps to a seller; the VTEX regionId is simply
 * base64("SW#" + sellerId), which fed to IS product_search returns that store's
 * prices and stock.
 *
 * VEA/Cencosud returns 0 pickup-points (proprietary, closed), so it yields no
 * stores and falls back to its default region.
 */

import type { GeoPoint } from '../geocode.js';

export interface Store {
  /** Seller id (e.g. "ardiaprod5575") — the unit that carries prices/stock. */
  sellerId: string;
  /** Full pickup-point id (e.g. "ardiaprod5575_pup5575P"). */
  storeId: string;
  name: string;
  city: string | null;
  state: string | null;
  /** Distance from the query point (VTEX units), ascending = closer. */
  distance: number;
}

interface PickupPointItem {
  distance?: number;
  pickupPoint?: {
    id?: string;
    friendlyName?: string;
    isActive?: boolean;
    address?: { city?: string; state?: string };
  };
}

// The endpoint returns either a bare array or a paged { items: [...] } envelope.
type PickupPointsResponse = PickupPointItem[] | { items?: PickupPointItem[] };

/**
 * Build the VTEX regionId for a set of store sellers: base64("SW#" + a;b;c).
 *
 * Region-accurate prices/stock require the FULL set of sellers serving the zone,
 * not a single store: a lone seller returns 0 products for Carrefour/MAS (only
 * DIA tolerates one). Passing all nearby store sellers yields the zone's merged
 * catalog (best price / any-stock across the area's stores). Returns null for an
 * empty set (no stores → fall back to the store's default region).
 */
export function regionIdForSellers(sellerIds: string[]): string | null {
  if (sellerIds.length === 0) return null;
  return Buffer.from(`SW#${sellerIds.join(';')}`).toString('base64');
}

/**
 * Fetch active physical stores near a point, nearest first, deduped by seller.
 * Returns [] on error or when the store exposes no pickup-points (e.g. VEA).
 */
export async function getStoresNear(baseUrl: string, geo: GeoPoint): Promise<Store[]> {
  const url =
    `${baseUrl}/api/checkout/pub/pickup-points` +
    `?geoCoordinates=${encodeURIComponent(geo.lng)};${encodeURIComponent(geo.lat)}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as PickupPointsResponse;
    const items = Array.isArray(data) ? data : (data.items ?? []);

    const bySeller = new Map<string, Store>();
    for (const item of items) {
      const pp = item.pickupPoint;
      if (!pp?.id || pp.isActive === false) continue;
      const sellerId = pp.id.split('_')[0];
      if (!sellerId || bySeller.has(sellerId)) continue;
      bySeller.set(sellerId, {
        sellerId,
        storeId: pp.id,
        name: pp.friendlyName ?? sellerId,
        city: pp.address?.city ?? null,
        state: pp.address?.state ?? null,
        distance: item.distance ?? Number.POSITIVE_INFINITY,
      });
    }
    return [...bySeller.values()].sort((a, b) => a.distance - b.distance);
  } catch {
    return [];
  }
}
