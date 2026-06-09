import { UA } from '../config/throttles.js';

const TIMEOUT_MS = 20_000;

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent': UA,
  Accept: 'application/json',
};

/**
 * Fetch a URL and parse the response as JSON.
 * Uses AbortSignal.timeout to cap request duration.
 */
export async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { ...DEFAULT_HEADERS, ...((options?.headers as Record<string, string>) ?? {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    ...options,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.json() as Promise<T>;
}

/**
 * Fetch a URL and return the response body as text.
 * Uses AbortSignal.timeout to cap request duration.
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
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.text();
}
