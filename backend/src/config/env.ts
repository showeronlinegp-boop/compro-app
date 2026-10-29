import 'dotenv/config';
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
  ENRICH_SIM_QTY,
  ENRICH_SKU_CONC,
} from './throttles.js';

export const PORT: number = Number(process.env.PORT ?? 3001);

/**
 * Lee una variable de texto recortando espacios; vacía = ausente. Un espacio
 * pegado de más en el panel del hosting rompía la conexión: Postgres buscaba
 * la base "railway " (con espacio) y no la encontraba.
 */
export const strEnv = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

// DATABASE_URL is required in all environments — set it in backend/.env (see .env.example).
const rawDatabaseUrl = strEnv('DATABASE_URL');
if (!rawDatabaseUrl) {
  throw new Error(
    '[env] DATABASE_URL is required — set it in backend/.env (see .env.example)',
  );
}
export const DATABASE_URL: string = rawDatabaseUrl;

export const NODE_ENV: string = strEnv('NODE_ENV') ?? 'development';

export const IS_PRODUCTION: boolean = NODE_ENV === 'production';

// Compras (comparador de supermercados, crawler y crons) — fail-closed: sólo se
// monta con ENABLE_COMPARADOR=true (dev local y tests). La imagen de producción
// no lo setea, así que sale sólo con Fiado.
export const ENABLE_COMPARADOR: boolean = strEnv('ENABLE_COMPARADOR') === 'true';

// ---------------------------------------------------------------------------
// Clerk auth — required in all environments; fail-closed on missing (same
// pattern as DATABASE_URL above).
// ---------------------------------------------------------------------------

const rawClerkSecretKey = strEnv('CLERK_SECRET_KEY');
if (!rawClerkSecretKey) {
  throw new Error(
    '[env] CLERK_SECRET_KEY is required — set it in backend/.env (see .env.example)',
  );
}
export const CLERK_SECRET_KEY: string = rawClerkSecretKey;

const rawClerkIssuer = strEnv('CLERK_ISSUER');
if (!rawClerkIssuer) {
  throw new Error(
    '[env] CLERK_ISSUER is required — set it in backend/.env (see .env.example)',
  );
}
export const CLERK_ISSUER: string = rawClerkIssuer;

// CORS_ORIGIN is required in production; optional in development (falls back
// to localhost). Comma-separated list of allowed origins.
const rawCorsOrigin = strEnv('CORS_ORIGIN');
if (!rawCorsOrigin && IS_PRODUCTION) {
  throw new Error(
    '[env] CORS_ORIGIN is required in production — set it in backend/.env (see .env.example)',
  );
}
export const CORS_ORIGIN: string = rawCorsOrigin ?? 'http://localhost:5173';

// ---------------------------------------------------------------------------
// Notas de prueba (cambio test-notes) — herramienta SOLO de desarrollo local.
// Sin TEST_NOTES_ENABLED=1 el módulo no se registra (/api/test-notes → 404).
// Con la flag en producción el arranque falla (decisión P2: nunca en prod).
// ---------------------------------------------------------------------------

/**
 * Resuelve la flag de notas de prueba. Solo `'1'` la activa; `'1'` con
 * `isProd` lanza un error que nombra la flag (fail-closed, como el resto de env).
 */
export function resolveTestNotesFlag(raw: string | undefined, isProd: boolean): boolean {
  if (raw?.trim() !== '1') return false;
  if (isProd) {
    throw new Error(
      '[env] TEST_NOTES_ENABLED=1 no está permitido con NODE_ENV=production — las notas de prueba son solo para desarrollo local',
    );
  }
  return true;
}

export const TEST_NOTES_ENABLED: boolean = resolveTestNotesFlag(
  process.env.TEST_NOTES_ENABLED,
  IS_PRODUCTION,
);

/** URL local del front que el CLI de notas usa para armar el link de cada nota. */
export const TEST_NOTES_APP_URL: string = process.env.TEST_NOTES_APP_URL ?? 'http://localhost:5173';

// ---------------------------------------------------------------------------
// Panel de uso (/api/admin/uso) — fail-closed: sin ADMIN_CLERK_USER_IDS nadie
// es admin y la ruta responde 403 a todos.
// ---------------------------------------------------------------------------

/** Lista separada por comas → ids sin espacios ni vacíos. */
export function parseIdList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Clerk user IDs (`user_…`) que pueden ver el panel de uso. */
export const ADMIN_CLERK_USER_IDS: readonly string[] = parseIdList(
  process.env.ADMIN_CLERK_USER_IDS,
);

/**
 * Cuentas que no cuentan en las métricas de uso (las de prueba). Los admins
 * quedan afuera siempre, estén o no en esta lista.
 */
export const METRICAS_EXCLUIR_CLERK_USER_IDS: readonly string[] = parseIdList(
  process.env.METRICAS_EXCLUIR_CLERK_USER_IDS,
);

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

/** Cart quantity for the 'simulation' enrich strategy (env: ENRICH_SIM_QTY). */
export const ENV_ENRICH_SIM_QTY: number = numEnv('ENRICH_SIM_QTY', ENRICH_SIM_QTY);
