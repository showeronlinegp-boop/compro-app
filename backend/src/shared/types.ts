// ─── Super / Config ───────────────────────────────────────────────────────────

export type SuperKey = 'vea' | 'masonline' | 'carrefour' | 'dia';

/**
 * Per-phase concurrency and throttle settings for the crawler.
 * All fields are optional — missing values fall back to env then static defaults.
 */
export interface CrawlConcurrency {
  /** Max concurrent IS-API probe requests in the probe phase. */
  probeConc: number;
  /** Max concurrent page requests within a single partition. */
  pageConc: number;
  /** Max concurrent partition workers in syncSuper. */
  partitionConc: number;
  /** Inter-partition courtesy delay in ms. */
  throttleMs: number;
}

export interface SuperConfig {
  baseUrl: string;
  promoSeller?: string;
  /** Optional per-super concurrency overrides (wins over env and static defaults). */
  crawl?: Partial<CrawlConcurrency>;
  /**
   * Enrichment strategy override for this super.
   *
   * - 'promotions': use the search-promotions endpoint (requires promoSeller).
   * - 'jsonld':     scrape product pages for server-side JSON-LD price data.
   * - 'none':       skip enrichment entirely; discounts come from the crawl itself.
   *
   * When unset, the strategy is derived: promoSeller present → 'promotions', else → 'jsonld'.
   */
  enrichStrategy?: 'promotions' | 'jsonld' | 'none';
}

// ─── DB row types ─────────────────────────────────────────────────────────────

/** Raw row as stored in the products table (available is 0/1 int, categories is JSON string) */
export interface ProductRow {
  id: number;
  super: string;
  product_id: string;
  sku_id: string | null;
  name: string;
  barcode: string | null;
  image_url: string | null;
  product_url: string | null;
  raw_price: number | null;
  offer_price: number | null;
  discount_pct: number;
  available: number; // 0 or 1
  categories: string | null; // JSON-encoded string[]
  synced_at: string;
}

// ─── API / domain types ───────────────────────────────────────────────────────

/** Product as returned by the API (parseRow output) */
export interface Product {
  id: number;
  super: string;
  product_id: string;
  sku_id: string | null;
  name: string;
  barcode: string | null;
  image_url: string | null;
  product_url: string | null;
  raw_price: number | null;
  offer_price: number | null;
  discount_pct: number;
  available: boolean;
  categories: string[];
  synced_at: string;
}

/** Normalized item output from the crawler normalizer */
export interface NormalizedCrawlItem {
  product_id: string;
  sku_id: string | null;
  name: string;
  barcode: string | null;
  image_url: string | null;
  product_url: string;
  raw_price: number | null;
  offer_price: number | null;
  discount_pct: number;
  available: boolean;
  category_paths: string[];
}

/** Crawler partition plan entry */
export interface Partition {
  path: string;
  name: string;
  total: number;
  truncated?: boolean;
}

// ─── Sync / Enrich status ─────────────────────────────────────────────────────

export type SyncStatusValue = 'pending' | 'running' | 'ok' | 'error';

export interface SyncLog {
  super: string;
  started_at: string | null;
  finished_at: string | null;
  product_count: number | null;
  status: SyncStatusValue;
  error: string | null;
  progress_leaf: number;
  total_leaves: number;
}

export interface EnrichStatus {
  total: number;
  done: number;
  updated: number;
  running: boolean;
  error: string | null;
  startedAt: string;
}

// ─── Feature types ────────────────────────────────────────────────────────────

export interface Interest extends Product {
  interest_id: number;
  added_at: string;
}

export interface ShoppingItem extends Product {
  shopping_id: number;
  frequency_days: number;
  last_bought: string | null;
  notes: string | null;
  shopping_created_at: string;
}

export interface TaxonomyEntry {
  slug: string;
  label: string;
  icon: string;
  vtex: string[];
}
