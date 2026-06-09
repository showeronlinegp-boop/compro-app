/**
 * pool.ts — Bounded concurrent task runner (sliding-window pool).
 *
 * runPool executes `worker` for each item in `items` with at most `concurrency`
 * workers in-flight simultaneously. Results are index-aligned to `items`
 * (input order preserved regardless of completion order).
 *
 * Rollback: set concurrency <= 1 to get purely sequential behavior.
 */

/**
 * Run `worker` over every item with at most `concurrency` concurrent executions.
 *
 * @param items       Input array (readonly).
 * @param concurrency Max in-flight workers. Values <= 1 run sequentially.
 * @param worker      Async function called with (item, index). Must NOT throw
 *                    unless you want the pool to reject immediately — callers
 *                    should wrap error-tolerant workers in try/catch internally.
 * @returns           Promise resolving to a result array index-aligned to `items`.
 */
export async function runPool<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  const limit = Math.max(1, Math.min(concurrency, items.length));
  let cursor = 0;

  // Each runner picks up the next available index atomically (single-threaded JS:
  // cursor++ between awaits has no race — only one microtask runs at a time).
  async function runner(): Promise<void> {
    while (cursor < items.length) {
      const i = cursor++;
      // biome-ignore lint/style/noNonNullAssertion: cursor < items.length guard
      results[i] = await worker(items[i]!, i);
    }
  }

  const runners = Array.from({ length: limit }, () => runner());
  await Promise.all(runners);
  return results;
}
