import {
  CRAWLER_PAGE_CONC,
  CRAWLER_PARTITION_CONC,
  CRAWLER_PROBE_CONC,
  CRAWLER_RETRY_BASE_MS,
  CRAWLER_RETRY_CAP_MS,
  CRAWLER_RETRY_FACTOR,
  CRAWLER_RETRY_MAX,
  CRAWLER_THROTTLE_MS,
  ENRICH_HTML_CONC,
  ENRICH_PROMO_BATCH,
  ENRICH_PROMO_CONC,
  ENRICH_SKU_CONC,
} from './throttles.js';

export const PORT: number = Number(process.env.PORT ?? 3001);

// DATABASE_URL is required in production; in development a localhost default is used.
const rawDatabaseUrl = process.env.DATABASE_URL;
if (!rawDatabaseUrl) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[env] DATABASE_URL env var is required in production');
  }
  console.warn(
    '[env] DATABASE_URL not set — using default postgresql://compro:compro@localhost:5433/compro (dev only)',
  );
}
export const DATABASE_URL: string =
  rawDatabaseUrl ?? 'postgresql://compro:compro@localhost:5433/compro';

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

// ---------------------------------------------------------------------------
// Enricher runtime config — resolved from env with static defaults as fallback.
// ---------------------------------------------------------------------------

/** Max concurrent HTML scraping requests (env: ENRICH_HTML_CONC). Set to 1 for sequential rollback. */
export const ENV_ENRICH_HTML_CONC: number = numEnv('ENRICH_HTML_CONC', ENRICH_HTML_CONC);

/** Max concurrent search-promotions requests (env: ENRICH_PROMO_CONC). */
export const ENV_ENRICH_PROMO_CONC: number = numEnv('ENRICH_PROMO_CONC', ENRICH_PROMO_CONC);

/** Max concurrent SKU-ID variation fetches (env: ENRICH_SKU_CONC). */
export const ENV_ENRICH_SKU_CONC: number = numEnv('ENRICH_SKU_CONC', ENRICH_SKU_CONC);

/** SKUs per search-promotions POST request (env: ENRICH_PROMO_BATCH). Hard endpoint limit = 20. */
export const ENV_ENRICH_PROMO_BATCH: number = numEnv('ENRICH_PROMO_BATCH', ENRICH_PROMO_BATCH);
