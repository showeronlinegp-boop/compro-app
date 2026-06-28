/**
 * throttles.ts — Per-context throttle and concurrency constants.
 *
 * Each section matches its legacy source EXACTLY.
 * NEVER merge these into a single flat set — each context has different
 * requirements and the values are NOT interchangeable.
 */

// ---------------------------------------------------------------------------
// Crawler (vtex-crawler.js)
// PAGE_SIZE, IS_SAFE_MAX, THROTTLE_MS are used by the IS product_search loop.
// Concurrency constants control the bounded runPool workers per phase.
// ---------------------------------------------------------------------------

/** Number of items per IS product_search page (vtex-crawler.js: PAGE_SIZE) */
export const CRAWLER_PAGE_SIZE = 50;

/** IS API hard limit is 2500; we leave margin (vtex-crawler.js: IS_SAFE_MAX) */
export const CRAWLER_IS_SAFE_MAX = 2450;

/**
 * Milliseconds of courtesy delay (inter-partition spacing).
 * Lowered from 500 → 150 for parallel mode; pacing is now primarily via
 * concurrency caps. Set CRAWLER_THROTTLE_MS env var to override at runtime.
 */
export const CRAWLER_THROTTLE_MS = 150;

/** Max concurrent IS-API probe requests in the probe phase. */
export const CRAWLER_PROBE_CONC = 8;

/** Max concurrent page requests within a single partition. */
export const CRAWLER_PAGE_CONC = 6;

/** Max concurrent partition workers in the syncSuper loop. */
export const CRAWLER_PARTITION_CONC = 2;

// ---------------------------------------------------------------------------
// Crawler retry / backoff defaults (fetchWithRetry)
// ---------------------------------------------------------------------------

/** Maximum retry attempts for retriable IS-API errors. */
export const CRAWLER_RETRY_MAX = 4;

/** Base backoff in ms for exponential backoff (doubles each attempt). */
export const CRAWLER_RETRY_BASE_MS = 500;

/** Exponential factor for backoff growth. */
export const CRAWLER_RETRY_FACTOR = 2;

/** Cap for computed backoff in ms (full-jitter capped here). */
export const CRAWLER_RETRY_CAP_MS = 8_000;

// ---------------------------------------------------------------------------
// Enricher (backend/enricher.js)
// Used for search-promotions batching and HTML scraping concurrency.
// PROMO_BATCH is a HARD endpoint limit — sending more returns HTTP 500.
// ---------------------------------------------------------------------------

/**
 * Max concurrent enricher requests for HTML scraping (Strategy B).
 * Default 40: DIA was measured handling 50 concurrent with 0 errors / 0 429s
 * (4762 pages in ~28s), so 40 leaves margin while staying ~8x faster than the
 * old batched model. fetchWithRetry backoff absorbs 429/503 bursts if a stricter
 * store pushes back. Override per-environment via ENRICH_HTML_CONC; set =1 for
 * sequential rollback.
 */
export const ENRICH_HTML_CONC = 40;

/**
 * Milliseconds to sleep between enricher request batches (legacy: enricher.js THROTTLE_MS).
 * No longer used as inter-batch sleep (runPool has no discrete batches).
 * Kept for reference / potential future use.
 */
export const ENRICH_THROTTLE_MS = 250;

/**
 * SKUs per search-promotions POST request (enricher.js: PROMO_BATCH).
 * Hard endpoint limit — sending more than 20 returns HTTP 500.
 */
export const ENRICH_PROMO_BATCH = 20;

/** Max concurrent search-promotions requests (enricher.js: PROMO_CONC) */
export const ENRICH_PROMO_CONC = 8;

/** Max concurrent SKU-ID variation fetches (enricher.js: SKU_CONC) */
export const ENRICH_SKU_CONC = 10;

/**
 * Cart quantity used by the 'simulation' enrich strategy (masonline).
 * 2 surfaces "2da al X%" / "2x1" promos — masonline's observed PromoVolumen promos
 * are all 2-unit thresholds. Raise to 3 to also catch "3x2"/"3er al X%" (none seen
 * on masonline as of the 2026-06 audit). The promo's real min_qty is parsed from the
 * benefit label, so this only gates which promos ACTIVATE, not the computed price.
 */
export const ENRICH_SIM_QTY = 2;

// ---------------------------------------------------------------------------
// Migration (backend/migrate-sku-ids.js)
// Used by the one-off sku_id backfill script.
// ---------------------------------------------------------------------------

/** Max concurrent variation API requests during sku_id migration (migrate-sku-ids.js: CONCURRENCY) */
export const MIGRATE_CONCURRENCY = 8;

/** Milliseconds to sleep between migration batches (migrate-sku-ids.js: THROTTLE_MS) */
export const MIGRATE_THROTTLE_MS = 150;

// ---------------------------------------------------------------------------
// Shared
// User-Agent string used by all contexts (identical across all legacy files).
// ---------------------------------------------------------------------------

/** User-Agent string for all VTEX API and HTML requests */
export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
