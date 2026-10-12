/**
 * zone.ts — client-side persistence of the visitor's chosen zone.
 *
 * A logged-out visitor can pick their zone without an account; we keep it in
 * localStorage so it survives reloads. A logged-in user's zone lives in their
 * profile (server-side) — that takes precedence when signed in.
 *
 * NOTE: today the catalog is single-region, so a stored zone does not yet change
 * prices. This is the anon-side foundation for the multi-region feature, where
 * the stored zone will drive which region's prices are fetched.
 */

const KEY = 'compro_zone';

export interface StoredZone {
  location_name: string;
  lat: number;
  lng: number;
}

export function getStoredZone(): StoredZone | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredZone>;
    if (
      typeof parsed.location_name === 'string' &&
      typeof parsed.lat === 'number' &&
      typeof parsed.lng === 'number'
    ) {
      return { location_name: parsed.location_name, lat: parsed.lat, lng: parsed.lng };
    }
    return null;
  } catch {
    return null;
  }
}

export function setStoredZone(zone: StoredZone): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(zone));
  } catch {
    // localStorage unavailable (private mode / quota) — non-fatal.
  }
}

export function clearStoredZone(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // non-fatal
  }
}
