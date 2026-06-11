/**
 * HTTP contract mirror. CANONICAL SOURCE: backend/src/shared/types.ts
 * (plus catalog.repo.ts for ProductGroup/GroupsResult/ProductListResult and
 *  shopping repo for WeeklyGroup). These are the *response* shapes only.
 * If the backend changes a response shape, update this file by hand.
 * Do NOT import from backend/* — Docker stages are isolated and backend uses
 * NodeNext resolution while this app uses Bundler.
 */

// ─── Super / Config ───────────────────────────────────────────────────────────

export type SuperKey = 'vea' | 'masonline' | 'carrefour' | 'dia';

// ─── Promotions ───────────────────────────────────────────────────────────────

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
}

// ─── Catalog result wrappers (defined in backend catalog repo, cross-wire shapes) ─

export interface ProductGroup {
  key: string;
  barcode: string | null;
  name: string;
  image_url: string | null;
  super_count: number;
  variants: Product[];
}

export interface GroupsResult {
  data: ProductGroup[];
  total: number;
  page: number;
  pages: number;
}

export interface ProductListResult {
  data: Product[];
  total: number;
  page: number;
  pages: number;
}

// ─── Shopping result wrappers ─────────────────────────────────────────────────

export interface WeeklyGroup {
  super: string;
  items: ShoppingItem[];
  total: number;
}
