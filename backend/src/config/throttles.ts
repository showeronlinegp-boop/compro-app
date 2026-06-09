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
// The crawler is sequential per partition (sleep THROTTLE_MS between pages);
// vtex-crawler.js has no parallel CONCURRENCY constant.
// ---------------------------------------------------------------------------

/** Number of items per IS product_search page (vtex-crawler.js: PAGE_SIZE) */
export const CRAWLER_PAGE_SIZE = 50;

/** IS API hard limit is 2500; we leave margin (vtex-crawler.js: IS_SAFE_MAX) */
export const CRAWLER_IS_SAFE_MAX = 2450;

/** Milliseconds to sleep between sequential crawler requests (vtex-crawler.js: THROTTLE_MS) */
export const CRAWLER_THROTTLE_MS = 500;

// ---------------------------------------------------------------------------
// Enricher (backend/enricher.js)
// Used for search-promotions batching and HTML scraping concurrency.
// PROMO_BATCH is a HARD endpoint limit — sending more returns HTTP 500.
// ---------------------------------------------------------------------------

/** Max concurrent enricher requests for HTML scraping (enricher.js: CONCURRENCY) */
export const ENRICH_CONCURRENCY = 15;

/** Milliseconds to sleep between enricher request batches (enricher.js: THROTTLE_MS) */
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
