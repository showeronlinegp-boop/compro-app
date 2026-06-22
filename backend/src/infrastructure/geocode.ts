/**
 * geocode.ts — Resolve an Argentine postal code to lat/lng.
 *
 * Uses OpenStreetMap Nominatim (free, no API key). This runs ONCE when the user
 * sets their location (to find nearby stores), never on a hot path. Results are
 * cached in-memory by postal code; Nominatim's usage policy asks for <=1 req/s
 * and a descriptive User-Agent, both honored here. For higher volume this should
 * move to a bundled CP→coords dataset or a persistent cache.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const UA = 'compro-app/1.0 (grocery price comparison)';

const cache = new Map<string, GeoPoint | null>();

interface NominatimResult {
  lat: string;
  lon: string;
}

/** Resolve a 4-digit Argentine postal code to coordinates, or null if not found. */
export async function geocodePostalCode(postalCode: string): Promise<GeoPoint | null> {
  const cp = postalCode.replace(/\D/g, '').slice(0, 4);
  if (cp.length < 4) return null;

  const cached = cache.get(cp);
  if (cached !== undefined) return cached;

  const url = `${NOMINATIM}?postalcode=${cp}&country=Argentina&format=json&limit=1`;
  let point: GeoPoint | null = null;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) {
      const data = (await res.json()) as NominatimResult[];
      const first = data[0];
      if (first) {
        const lat = Number(first.lat);
        const lng = Number(first.lon);
        if (Number.isFinite(lat) && Number.isFinite(lng)) point = { lat, lng };
      }
    }
  } catch {
    point = null;
  }

  cache.set(cp, point);
  return point;
}

export interface GeoSuggestion {
  display_name: string;
  lat: number;
  lng: number;
}

const addressCache = new Map<string, GeoSuggestion[]>();

/** Forward-geocode a free-text address/city/neighborhood in Argentina. Returns up to 5 suggestions. */
export async function geocodeAddress(q: string): Promise<GeoSuggestion[]> {
  const key = q.trim().toLowerCase();
  if (!key) return [];
  const cached = addressCache.get(key);
  if (cached !== undefined) return cached;

  const url = `${NOMINATIM}?q=${encodeURIComponent(q)}&countrycodes=ar&format=json&limit=5&addressdetails=0`;
  let results: GeoSuggestion[] = [];
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) {
      const data = (await res.json()) as Array<{ display_name: string; lat: string; lon: string }>;
      results = data
        .map((r) => ({ display_name: r.display_name, lat: Number(r.lat), lng: Number(r.lon) }))
        .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
    }
  } catch {
    results = [];
  }

  addressCache.set(key, results);
  return results;
}

const reverseCache = new Map<string, string | null>();

/** Reverse-geocode coordinates to a human-readable location name. */
export async function reverseGeocode(geo: GeoPoint): Promise<string | null> {
  const key = `${geo.lat.toFixed(4)},${geo.lng.toFixed(4)}`;
  const cached = reverseCache.get(key);
  if (cached !== undefined) return cached;

  const url = `https://nominatim.openstreetmap.org/reverse?lat=${geo.lat}&lon=${geo.lng}&format=json&addressdetails=1`;
  let result: string | null = null;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) {
      const data = (await res.json()) as {
        display_name?: string;
        address?: { city?: string; town?: string; village?: string; state?: string };
      };
      const addr = data.address;
      const city = addr?.city ?? addr?.town ?? addr?.village;
      result = city && addr?.state ? `${city}, ${addr.state}` : (data.display_name ?? null);
    }
  } catch {
    result = null;
  }

  reverseCache.set(key, result);
  return result;
}
