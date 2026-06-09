/**
 * sync-state.ts — In-memory running Set for crawler sync operations.
 *
 * Port of the `running` Set from backend/crawler-service.js.
 * Semantics preserved: state is lost on process restart (intentional, non-goal).
 */

const running = new Set<string>();

/** Returns true if a sync for the given superKey is currently in progress. */
export function isRunning(superKey: string): boolean {
  return running.has(superKey);
}

/** Mark a sync as started. */
export function markRunning(superKey: string): void {
  running.add(superKey);
}

/** Mark a sync as finished (removes from running set). */
export function markDone(superKey: string): void {
  running.delete(superKey);
}
