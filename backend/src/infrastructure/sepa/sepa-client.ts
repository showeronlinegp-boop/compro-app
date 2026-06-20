/**
 * sepa-client.ts — VEA store resolution via Precios Claros / SEPA.
 *
 * VEA/Cencosud exposes no VTEX pickup-points, so SEPA is the only source of VEA
 * store LOCATIONS. We use it solely to find the nearest VEA sucursal (and its
 * store number) for a zone; pricing comes from VTEX, not SEPA.
 *
 * This is the undocumented public API the preciosclaros.gob.ar front-end uses.
 * On any error (incl. HTML rate-limit pages) functions return null.
 */

import type { GeoPoint } from '../geocode.js';

const BASE = 'https://d3e6htiiul5ek9.cloudfront.net/prod';
// Public key embedded in the Precios Claros front-end. Override via env if rotated.
const API_KEY = process.env.SEPA_API_KEY ?? 'qfcNgctUb27Qw5w07u0sA5pNfp51Q9mo9XhIuZpw';
const HEADERS = { 'x-api-key': API_KEY, 'User-Agent': 'Mozilla/5.0' };

// Safe JSON fetch: the API returns an HTML page when rate-limiting, so guard it.
async function safeJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: HEADERS });
    const text = await res.text();
    if (!res.ok || text.trimStart().startsWith('<')) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

interface SucursalRaw {
  id: string;
  banderaDescripcion?: string;
  sucursalNombre?: string;
  localidad?: string;
  provincia?: string;
}

interface SucursalesResponse {
  sucursales?: SucursalRaw[];
}

/** Nearest VEA store to a point, with its store number — the join key to the VTEX seller slug. */
export interface VeaSucursal {
  /** SEPA store number (third segment of the SEPA id, e.g. "669" from "9-1-669"). */
  storeNumber: string;
  name: string;
  city: string | null;
  state: string | null;
}

/**
 * Resolve the nearest VEA sucursal to a point via SEPA (Cencosud exposes no
 * VTEX pickup-points, so SEPA is the only source of VEA store locations). The
 * SEPA list is distance-sorted, so the first Vea match is the closest. Returns
 * its store number, which maps to the VTEX seller slug (see vea-region-client).
 */
export async function getVeaSucursalNear(geo: GeoPoint): Promise<VeaSucursal | null> {
  const data = await safeJson<SucursalesResponse>(
    `${BASE}/sucursales?lat=${encodeURIComponent(geo.lat)}&lng=${encodeURIComponent(geo.lng)}&limit=200`,
  );
  const vea = (data?.sucursales ?? []).find((s) => /vea/i.test(s.banderaDescripcion ?? ''));
  if (!vea) return null;
  const storeNumber = vea.id.split('-').at(-1) ?? '';
  if (!storeNumber) return null;
  return {
    storeNumber,
    name: vea.sucursalNombre ?? `VEA ${vea.localidad ?? storeNumber}`,
    city: vea.localidad ?? null,
    state: vea.provincia ?? null,
  };
}
