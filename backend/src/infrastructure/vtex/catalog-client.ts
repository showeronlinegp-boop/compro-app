/**
 * catalog-client.ts — VTEX catalog_system API client.
 *
 * Single canonical location for fetchSkuId (dedup target).
 * Imported by both the enricher port (Slice 6) and the
 * backfill-sku-ids migration script.
 *
 * Ported from backend/enricher.js: fetchSkuId().
 * NOT yet wired into the running app — Slice 6 cutover.
 */

import { UA } from '../../config/throttles.js';
import type { SuperConfig } from '../../shared/types.js';

interface VariationsResponse {
  skus?: Array<{ sku: string | number }>;
}

/**
 * Fetch the first SKU ID for a given productId via the
 * catalog_system/pub/products/variations/:productId endpoint.
 *
 * Returns the string SKU ID, or null on any failure.
 * Port of fetchSkuId() in enricher.js — semantics identical.
 */
export async function fetchSkuId(cfg: SuperConfig, productId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${cfg.baseUrl}/api/catalog_system/pub/products/variations/${productId}`,
      {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as VariationsResponse;
    const sku = data?.skus?.[0]?.sku;
    return sku != null ? String(sku) : null;
  } catch {
    return null;
  }
}
