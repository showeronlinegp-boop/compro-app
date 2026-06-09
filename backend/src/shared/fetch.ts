import { UA } from '../config/throttles.js';

const TIMEOUT_MS = 20_000;

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent': UA,
  Accept: 'application/json',
};

// ---------------------------------------------------------------------------
// HttpError — status-bearing fetch error
// ---------------------------------------------------------------------------

/**
 * Thrown by fetchJson/fetchText when the response is not ok.
 * Carries the HTTP status, the request URL, and the parsed Retry-After delay.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly retryAfterMs: number | null,
  ) {
    super(`HTTP ${status} — ${url}`);
    this.name = 'HttpError';
  }
}

// ---------------------------------------------------------------------------
// parseRetryAfter — convert Retry-After header value to milliseconds
// ---------------------------------------------------------------------------

/**
 * Parse the value of a `Retry-After` response header.
 *
 * - Numeric seconds → multiply by 1000.
 * - HTTP-date string → difference from now (clamped >= 0).
 * - Anything else / null → null.
 */
export function parseRetryAfter(value: string | null): number | null {
  if (value == null || value.trim() === '') return null;

  const numeric = Number(value.trim());
  if (!Number.isNaN(numeric)) return Math.max(0, numeric * 1000);

  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return Math.max(0, parsed - Date.now());

  return null;
}

// ---------------------------------------------------------------------------
// fetchJson / fetchText — thin fetch wrappers
// ---------------------------------------------------------------------------

/**
 * Fetch a URL and parse the response as JSON.
 * Uses AbortSignal.timeout to cap request duration.
 * Throws HttpError on non-ok responses.
 */
export async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { ...DEFAULT_HEADERS, ...((options?.headers as Record<string, string>) ?? {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    ...options,
  });
  if (!res.ok)
    throw new HttpError(res.status, url, parseRetryAfter(res.headers.get('retry-after')));
  return res.json() as Promise<T>;
}

/**
 * Fetch a URL and return the response body as text.
 * Uses AbortSignal.timeout to cap request duration.
 * Throws HttpError on non-ok responses.
 */
export async function fetchText(url: string, options?: RequestInit): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml',
      ...((options?.headers as Record<string, string>) ?? {}),
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    ...options,
  });
  if (!res.ok)
    throw new HttpError(res.status, url, parseRetryAfter(res.headers.get('retry-after')));
  return res.text();
}

// ---------------------------------------------------------------------------
// fetchWithRetry — exponential backoff with full jitter + Retry-After support
// ---------------------------------------------------------------------------

/**
 * HTTP status codes that are eligible for retry.
 * 403 is intentionally EXCLUDED: it signals a WAF/bot hard-block, not
 * throttling — retrying a 403 wastes time and may worsen the block.
 */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface RetryOpts {
  /** Maximum number of retry attempts (default: 4). */
  maxRetries?: number;
  /** Base backoff in ms (default: 500). */
  base?: number;
  /** Exponential factor (default: 2). */
  factor?: number;
  /** Cap for the computed backoff in ms (default: 8000). */
  cap?: number;
  /**
   * Override the sleep function — useful in tests to avoid real delays.
   * Defaults to a real setTimeout-backed sleep.
   */
  sleepFn?: (ms: number) => Promise<void>;
}

/**
 * Wrap an arbitrary async fetch thunk with exponential-backoff retry.
 *
 * Retries on:
 *   - HttpError with status in RETRYABLE_STATUS (429, 500, 502, 503, 504)
 *   - TimeoutError (AbortSignal.timeout expiry)
 *
 * Does NOT retry:
 *   - HttpError 403 (WAF/bot block — fail fast)
 *   - HttpError 404 and other 4xx (deterministic; retry won't help)
 *   - Non-HttpError / non-timeout exceptions
 *
 * Delay formula: full-jitter exponential backoff.
 *   backoff  = min(cap, base * factor^attempt)
 *   jittered = random(0, backoff)
 *   waitMs   = retryAfterMs != null ? max(retryAfterMs, jittered) : jittered
 *
 * @param fn   Thunk returning a Promise. Called on first attempt and each retry.
 * @param opts Optional backoff config and sleep override for testing.
 */
export async function fetchWithRetry<T>(fn: () => Promise<T>, opts?: RetryOpts): Promise<T> {
  const maxRetries = opts?.maxRetries ?? 4;
  const base = opts?.base ?? 500;
  const factor = opts?.factor ?? 2;
  const cap = opts?.cap ?? 8_000;
  const sleepFn = opts?.sleepFn ?? sleep;

  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryableHttp =
        err instanceof HttpError && RETRYABLE_STATUS.has((err as HttpError).status);
      const isTimeout = (err as Error)?.name === 'TimeoutError';

      if ((!isRetryableHttp && !isTimeout) || attempt >= maxRetries) throw err;

      const backoff = Math.min(cap, base * factor ** attempt);
      const jittered = Math.random() * backoff;
      const waitMs =
        isRetryableHttp && (err as HttpError).retryAfterMs != null
          ? // biome-ignore lint/style/noNonNullAssertion: guarded by != null check above
            Math.max((err as HttpError).retryAfterMs!, jittered)
          : jittered;

      await sleepFn(waitMs);
    }
  }
}
