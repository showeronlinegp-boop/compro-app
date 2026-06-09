/**
 * pool.test.ts — Unit tests for runPool.
 *
 * Scenarios:
 *   (a) Bounded in-flight: counter never exceeds concurrency limit.
 *   (b) Results are index-aligned to inputs (input order preserved).
 *   (c) concurrency=1 runs sequentially (items processed in order, one at a time).
 *   (d) Rejects on first worker error (pool propagates the rejection).
 */

import { describe, expect, it } from 'vitest';
import { runPool } from '../pool.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a deferred promise — caller controls when it resolves. */
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
} {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runPool', () => {
  it('(a) bounded in-flight: counter never exceeds concurrency', async () => {
    const CONC = 3;
    const ITEMS = 10;
    let inFlight = 0;
    let maxInFlight = 0;

    const deferreds = Array.from({ length: ITEMS }, () => deferred<number>());

    // Start pool (do not await yet)
    const poolPromise = runPool(
      deferreds.map((d) => d),
      CONC,
      async (d) => {
        inFlight++;
        if (inFlight > maxInFlight) maxInFlight = inFlight;
        const result = await d.promise;
        inFlight--;
        return result;
      },
    );

    // Resolve deferreds one by one, yielding to the microtask queue each time
    for (let i = 0; i < ITEMS; i++) {
      deferreds[i]!.resolve(i);
      // yield to let the pool start the next worker
      await Promise.resolve();
      await Promise.resolve();
    }

    await poolPromise;
    expect(maxInFlight).toBeLessThanOrEqual(CONC);
  });

  it('(b) results are index-aligned to inputs', async () => {
    const items = [10, 20, 30, 40, 50];

    const results = await runPool(items, 3, async (item, i) => {
      // Stagger resolution: later items finish first (reverse order)
      await new Promise<void>((r) => setTimeout(r, (items.length - i) * 5));
      return item * 2;
    });

    expect(results).toEqual([20, 40, 60, 80, 100]);
  });

  it('(c) concurrency=1 runs sequentially (preserves order)', async () => {
    const order: number[] = [];
    const items = [0, 1, 2, 3, 4];

    await runPool(items, 1, async (item) => {
      order.push(item);
      return item;
    });

    expect(order).toEqual([0, 1, 2, 3, 4]);
  });

  it('(d) rejects on first worker error, propagates the error', async () => {
    const items = [1, 2, 3, 4, 5];

    await expect(
      runPool(items, 2, async (item) => {
        if (item === 3) throw new Error(`worker failed on item ${item}`);
        return item;
      }),
    ).rejects.toThrow('worker failed on item 3');
  });

  it('returns empty array for empty input', async () => {
    const results = await runPool([], 4, async (x: number) => x);
    expect(results).toEqual([]);
  });

  it('handles concurrency > items.length gracefully', async () => {
    const items = [1, 2];
    const results = await runPool(items, 100, async (x) => x * 10);
    expect(results).toEqual([10, 20]);
  });
});
