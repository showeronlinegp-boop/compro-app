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
  /**
   * When true, the normalizer falls back to ListPrice to detect a discount when
   * PriceWithoutDiscount === Price (i.e. the super encodes its strike-through in
   * ListPrice — confirmed for dia / masonline / carrefour).
   *
   * Leave unset/false for supers whose ListPrice is stale garbage (vea: e.g.
   * ListPrice 528017 vs Price 6389). VEA's real discounts arrive via the
   * search-promotions enricher, not the crawl. The DISCOUNT_CAP still applies
   * as a second safety net regardless of this flag.
   */
  trustListPrice?: boolean;
}

// ─── Promotions ─────────────────────────────────────────────────────────────

/**
 * A conditional / cart-level promotion captured from VTEX teasers.
 *
 * These promos (e.g. "2do al 80%", "2x1") never lower the unit price, so they
 * are NOT representable as discount_pct on raw_price. We keep them as a separate
 * list so the unit price stays honest and the badge stays informative.
 */
export interface Promotion {
  /** Display label exactly as the super shows it, e.g. "2do al 80%". */
  label: string;
  /** Coarse kind, inferred from the teaser conditions. */
  type: 'nth_unit' | 'other';
  /** Minimum units required to trigger the promo (null if unconditional). */
  min_qty: number | null;
  /** Percentual discount applied by the promo's effect (null if not a % effect). */
  discount_pct: number | null;
}

// ─── DB row types ─────────────────────────────────────────────────────────────

/**
 * Raw row as returned by $queryRaw from the products table.
 * PostgreSQL returns available as boolean and categories/promotions as parsed
 * jsonb arrays (unknown[] | null). The synced_at column is Timestamptz and
 * comes back as a Date object from Prisma — callers must .toISOString() it.
 */
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
  available: boolean;
  categories: unknown[] | null;
  promotions: unknown[] | null;
  synced_at: string | Date;
  category_key?: string | null;
  brand_tier?: number | null;
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
  promotions: Promotion[];
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
  promotions: Promotion[];
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

// ─── Profile / Onboarding ────────────────────────────────────────────────────

export type PerfilHogar = 'joven_solo' | 'pareja' | 'familia_con_ninos' | 'adultos_mayores';

export type TierValue = 1 | 2 | 3;

export type TierMap = Record<string, TierValue | null>;

/** Resolved VTEX regionId per super. null = could not resolve (e.g. VEA/Cencosud). */
export type RegionIds = Partial<Record<SuperKey, string | null>>;

/** A physical store near the user (its seller drives region-accurate prices). */
export interface StoreLocation {
  sellerId: string;
  name: string;
  city: string | null;
  state: string | null;
}

/** Stores per super that serve the user's zone. [] = none (e.g. VEA) → default region. */
export type StoreMap = Partial<Record<SuperKey, StoreLocation[]>>;

export interface UserProfile {
  id: number;
  nombre: string;
  edad: number | null;
  genero: string | null;
  hogar_tamano: number;
  hogar_chicos: string[] | null;
  hogar_adultos_mayores: boolean;
  hogar_mascotas: string[] | null;
  tier_por_categoria: TierMap;
  price_driven: string[] | null;
  perfil_hogar: PerfilHogar;
  nse_proxy: string | null;
  onboarding_done: boolean;
  postal_code: string | null;
  region_ids: RegionIds | null;
  stores: StoreMap | null;
  created_at: string;
  updated_at: string;
}

export interface OnboardingAnswers {
  nombre: string;
  edad?: number;
  genero?: string;
  hogar_tamano: number;
  hogar_chicos: string[];
  hogar_adultos_mayores: boolean;
  hogar_mascotas: string[];
  pref_almacen_1: TierValue | 'price_driven';
  pref_lacteos: TierValue | 'price_driven';
  pref_almacen_2: TierValue | 'price_driven';
  pref_bebidas: TierValue | 'price_driven';
  pref_limpieza: TierValue | 'price_driven';
  pref_personal: TierValue | 'price_driven';
}

// ─── Recommendations ─────────────────────────────────────────────────────────

export interface ShoppingRecommendation extends ShoppingItem {
  days_until_due: number;
  reason: 'advance_buy';
}

// ─── Compare multi-super ─────────────────────────────────────────────────────

export interface SuperMatch {
  super: string;
  product_id: number;
  name: string;
  price: number;
  matched_by: 'barcode' | 'name_similarity';
}

export interface CompareItem {
  shopping_id: number;
  name: string;
  home_super: string;
  home_price: number;
  matches: SuperMatch[];
}

export interface SuperSummary {
  super: string;
  total: number;
  coverage: number;
  missing_items: number;
}

export interface CompareResult {
  items: CompareItem[];
  option_a: SuperSummary[];
  option_b: {
    total: number;
    by_super: SuperSummary[];
    breakdown: Array<{ shopping_id: number; best_super: string; price: number }>;
    savings_vs_option_a: number;
  };
}
