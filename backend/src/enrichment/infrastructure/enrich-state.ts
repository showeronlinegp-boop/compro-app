/**
 * enrich-state.ts — In-memory enrichment status map.
 *
 * Mirrors legacy enricher.js `status` Map semantics.
 * Single module-level Map, same process lifetime as legacy.
 * getStatus/setStatus/isRunning match legacy getStatus()/isRunning(superKey).
 */

import type { EnrichStatus } from '../../shared/types.js';

// superKey → EnrichStatus — identical to legacy `status` Map in enricher.js
const status = new Map<string, EnrichStatus>();

/**
 * Get a snapshot of all super statuses (cloned objects).
 * Port of legacy getStatus() in enricher.js.
 */
export function getStatus(): Record<string, EnrichStatus> {
  const out: Record<string, EnrichStatus> = {};
  for (const [k, v] of status) out[k] = { ...v };
  return out;
}

/**
 * Set the full status for a super key.
 */
export function setStatus(superKey: string, st: EnrichStatus): void {
  status.set(superKey, st);
}

/**
 * Check if enrichment is currently running for a super key.
 * Port of legacy isRunning(superKey) in enricher.js.
 */
export function isRunning(superKey: string): boolean {
  return status.get(superKey)?.running === true;
}
