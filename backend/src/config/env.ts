import * as nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CRAWLER_PAGE_CONC,
  CRAWLER_PARTITION_CONC,
  CRAWLER_PROBE_CONC,
  CRAWLER_RETRY_BASE_MS,
  CRAWLER_RETRY_CAP_MS,
  CRAWLER_RETRY_FACTOR,
  CRAWLER_RETRY_MAX,
  CRAWLER_THROTTLE_MS,
} from './throttles.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = nodePath.dirname(__filename);

export const PORT: number = Number(process.env.PORT ?? 3001);

// DB_PATH is required — fail fast if absent
const rawDbPath = process.env.DB_PATH;
if (!rawDbPath) {
  // In development, default to a local file; in production, this env var must be set.
  // We set a default here to keep dev ergonomics intact, but log a warning.
  console.warn('[env] DB_PATH not set — using default path ../compro.db (dev only)');
}
export const DB_PATH: string = rawDbPath ?? nodePath.join(__dirname, '..', '..', '..', 'compro.db');

export const NODE_ENV: string = process.env.NODE_ENV ?? 'development';

export const IS_PRODUCTION: boolean = NODE_ENV === 'production';

// ---------------------------------------------------------------------------
// Crawler runtime config — resolved from env with static defaults as fallback.
// Missing or non-numeric values fall back to the static default (never throw).
// ---------------------------------------------------------------------------

/**
 * Parse a numeric environment variable, falling back to `defaultValue` when
 * the variable is absent, empty, or non-numeric.
 */
export const numEnv = (key: string, defaultValue: number): number => {
  const raw = process.env[key];
  if (raw == null || raw.trim() === '') return defaultValue;
  const n = Number(raw);
  return Number.isNaN(n) || n === 0 ? defaultValue : n;
};

/** Max concurrent IS-API probe requests (env: CRAWLER_PROBE_CONC). */
export const ENV_CRAWLER_PROBE_CONC: number = numEnv('CRAWLER_PROBE_CONC', CRAWLER_PROBE_CONC);

/** Max concurrent page requests per partition (env: CRAWLER_PAGE_CONC). */
export const ENV_CRAWLER_PAGE_CONC: number = numEnv('CRAWLER_PAGE_CONC', CRAWLER_PAGE_CONC);

/** Max concurrent partition workers (env: CRAWLER_PARTITION_CONC). */
export const ENV_CRAWLER_PARTITION_CONC: number = numEnv(
  'CRAWLER_PARTITION_CONC',
  CRAWLER_PARTITION_CONC,
);

/** Inter-partition throttle delay in ms (env: CRAWLER_THROTTLE_MS). */
export const ENV_CRAWLER_THROTTLE_MS: number = numEnv('CRAWLER_THROTTLE_MS', CRAWLER_THROTTLE_MS);

/** Maximum retry attempts for retriable IS-API errors (env: CRAWLER_RETRY_MAX). */
export const ENV_CRAWLER_RETRY_MAX: number = numEnv('CRAWLER_RETRY_MAX', CRAWLER_RETRY_MAX);

/** Base backoff in ms (env: CRAWLER_RETRY_BASE_MS). */
export const ENV_CRAWLER_RETRY_BASE_MS: number = numEnv(
  'CRAWLER_RETRY_BASE_MS',
  CRAWLER_RETRY_BASE_MS,
);

/** Exponential backoff factor (env: CRAWLER_RETRY_FACTOR). */
export const ENV_CRAWLER_RETRY_FACTOR: number = numEnv(
  'CRAWLER_RETRY_FACTOR',
  CRAWLER_RETRY_FACTOR,
);

/** Backoff cap in ms (env: CRAWLER_RETRY_CAP_MS). */
export const ENV_CRAWLER_RETRY_CAP_MS: number = numEnv(
  'CRAWLER_RETRY_CAP_MS',
  CRAWLER_RETRY_CAP_MS,
);
