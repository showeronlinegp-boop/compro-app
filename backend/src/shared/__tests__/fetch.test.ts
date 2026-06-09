/**
 * fetch.test.ts — Unit tests for fetchWithRetry, HttpError, parseRetryAfter.
 *
 * Scenarios:
 *   - 429 with Retry-After: retried, delay honors header value.
 *   - 503 backoff: retried up to maxRetries, uses jittered backoff.
 *   - Exhausted retries: throws status-bearing HttpError after maxRetries+1 calls.
 *   - 403 is NOT retried (WAF hard-block — fail immediately).
 *   - 404 is NOT retried (deterministic failure — fail immediately).
 *   - Test override (base=0, cap=0): retries happen with zero delay.
 *   - Retry-After precedence: max(retryAfterMs, jitter) used as delay.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError, fetchWithRetry, parseRetryAfter } from '../fetch.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a sleepFn that records calls and resolves immediately. */
function makeSleepSpy() {
  const calls: number[] = [];
  const fn = async (ms: number): Promise<void> => {
    calls.push(ms);
  };
  return { fn, calls };
}

/** Build a stub fn that throws HttpError(status) for N attempts then resolves. */
function makeStub<T>(
  throwStatus: number,
  throwCount: number,
  resolvedValue: T,
  retryAfterMs: number | null = null,
) {
  let calls = 0;
  return {
    fn: async (): Promise<T> => {
      calls++;
      if (calls <= throwCount)
        throw new HttpError(throwStatus, 'https://example.com', retryAfterMs);
      return resolvedValue;
    },
    getCallCount: () => calls,
  };
}

// ---------------------------------------------------------------------------
// parseRetryAfter
// ---------------------------------------------------------------------------

describe('parseRetryAfter', () => {
  it('converts numeric seconds to ms', () => {
    expect(parseRetryAfter('5')).toBe(5000);
    expect(parseRetryAfter('0')).toBe(0);
    expect(parseRetryAfter('60')).toBe(60_000);
  });

  it('returns null for null input', () => {
    expect(parseRetryAfter(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseRetryAfter('')).toBeNull();
  });

  it('returns null for non-parseable value', () => {
    expect(parseRetryAfter('bogus')).toBeNull();
  });

  it('parses HTTP-date and returns non-negative ms', () => {
    // A date far in the future should return a positive number
    const futureDate = new Date(Date.now() + 10_000).toUTCString();
    const result = parseRetryAfter(futureDate);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(0);
  });

  it('clamps past HTTP-date to 0', () => {
    const pastDate = new Date(Date.now() - 5_000).toUTCString();
    expect(parseRetryAfter(pastDate)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// fetchWithRetry
// ---------------------------------------------------------------------------

describe('fetchWithRetry', () => {
  beforeEach(() => {
    // Deterministic jitter: Math.random() = 0 => jitter = 0 * backoff = 0
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns resolved value on first try (no errors)', async () => {
    const { fn } = makeStub(429, 0, 'ok');
    const result = await fetchWithRetry(fn, { sleepFn: async () => {} });
    expect(result).toBe('ok');
  });

  it('retries 429 up to maxRetries and resolves if fn eventually succeeds', async () => {
    const { fn, getCallCount } = makeStub(429, 2, 'success');
    const sleep = makeSleepSpy();

    const result = await fetchWithRetry(fn, {
      maxRetries: 4,
      base: 100,
      cap: 1000,
      sleepFn: sleep.fn,
    });
    expect(result).toBe('success');
    expect(getCallCount()).toBe(3); // 2 failures + 1 success
    expect(sleep.calls).toHaveLength(2);
  });

  it('retries 503 up to maxRetries', async () => {
    const { fn, getCallCount } = makeStub(503, 3, 'recovered');
    const sleep = makeSleepSpy();

    const result = await fetchWithRetry(fn, {
      maxRetries: 4,
      base: 10,
      cap: 100,
      sleepFn: sleep.fn,
    });
    expect(result).toBe('recovered');
    expect(getCallCount()).toBe(4);
  });

  it('throws after exhausting maxRetries with status-bearing HttpError', async () => {
    const maxRetries = 4;
    const { fn, getCallCount } = makeStub(429, maxRetries + 1, 'never');
    const sleep = makeSleepSpy();

    await expect(
      fetchWithRetry(fn, { maxRetries, base: 10, cap: 100, sleepFn: sleep.fn }),
    ).rejects.toThrow(HttpError);

    expect(getCallCount()).toBe(maxRetries + 1); // initial + maxRetries
    expect(sleep.calls).toHaveLength(maxRetries);
  });

  it('does NOT retry 403 (WAF hard-block) — throws immediately', async () => {
    const { fn, getCallCount } = makeStub(403, 10, 'never');
    const sleep = makeSleepSpy();

    await expect(fetchWithRetry(fn, { maxRetries: 4, sleepFn: sleep.fn })).rejects.toMatchObject({
      status: 403,
    });

    expect(getCallCount()).toBe(1); // only one attempt
    expect(sleep.calls).toHaveLength(0);
  });

  it('does NOT retry 404 — throws immediately', async () => {
    const { fn, getCallCount } = makeStub(404, 10, 'never');
    const sleep = makeSleepSpy();

    await expect(fetchWithRetry(fn, { maxRetries: 4, sleepFn: sleep.fn })).rejects.toMatchObject({
      status: 404,
    });

    expect(getCallCount()).toBe(1);
    expect(sleep.calls).toHaveLength(0);
  });

  it('honors Retry-After header: delay = max(retryAfterMs, jitter)', async () => {
    // retryAfterMs = 3000, jitter = 0 (Math.random = 0) → waitMs = max(3000, 0) = 3000
    const { fn } = makeStub(429, 1, 'ok', 3000);
    const sleep = makeSleepSpy();

    await fetchWithRetry(fn, { maxRetries: 2, base: 100, cap: 500, sleepFn: sleep.fn });

    expect(sleep.calls[0]).toBe(3000);
  });

  it('test override (base=0, cap=0): retries with zero delay', async () => {
    const { fn, getCallCount } = makeStub(500, 2, 'zero-sleep');
    const sleep = makeSleepSpy();

    const result = await fetchWithRetry(fn, {
      maxRetries: 4,
      base: 0,
      cap: 0,
      sleepFn: sleep.fn,
    });

    expect(result).toBe('zero-sleep');
    expect(getCallCount()).toBe(3);
    // All sleeps should be 0ms (or very small since random*0 = 0)
    for (const ms of sleep.calls) {
      expect(ms).toBe(0);
    }
  });

  it('retries 500, 502, 504 as retryable', async () => {
    for (const status of [500, 502, 504]) {
      const { fn, getCallCount } = makeStub(status, 1, 'ok');
      const sleep = makeSleepSpy();

      const result = await fetchWithRetry(fn, { maxRetries: 2, base: 0, sleepFn: sleep.fn });
      expect(result).toBe('ok');
      expect(getCallCount()).toBe(2);
    }
  });
});
