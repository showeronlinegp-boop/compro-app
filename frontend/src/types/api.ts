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

// ─── Sort ───────────────────────────────────────────────────────────────────

/** Catalog ordering options. Mirrors backend SortKey (catalog/domain/sort.ts). */
export type SortKey = 'relevance' | 'discount_desc' | 'price_asc' | 'price_desc';

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
  category_key: string | null;
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

// ─── Promo offers ─────────────────────────────────────────────────────────────

export interface PromoOffer {
  id: number;
  super: SuperKey;
  bank: string | null;
  title: string | null;
  description: string | null;
  discountPct: number | null;
  installments: number | null;
  interestFree: boolean | null;
  logoUrl: string | null;
  imageUrl: string | null;
  validity: string | null;
  capturedAt: number;
  sourceUrl: string;
}

// ─── Shopping result wrappers ─────────────────────────────────────────────────

export interface WeeklyGroup {
  super: string;
  items: ShoppingItem[];
  total: number;
}

// ─── Profile / Onboarding ────────────────────────────────────────────────────

export type PerfilHogar = 'joven_solo' | 'pareja' | 'familia_con_ninos' | 'adultos_mayores';
export type TierValue = 1 | 2 | 3;
export type TierMap = Record<string, TierValue | null>;

/** Resolved VTEX regionId per super. null = could not resolve (e.g. VEA/Cencosud). */
export type RegionIds = Partial<Record<SuperKey, string | null>>;

/** A physical store candidate returned when resolving a postal code. */
export interface Store {
  sellerId: string;
  storeId: string;
  name: string;
  city: string | null;
  state: string | null;
  distance: number;
}

/** A store serving the user's zone (persisted on the profile, for display). */
export interface StoreLocation {
  sellerId: string;
  name: string;
  city: string | null;
  state: string | null;
}

export type StoreMap = Partial<Record<SuperKey, StoreLocation[]>>;

export interface GeoSuggestion {
  display_name: string;
  lat: number;
  lng: number;
}

export interface StoresResolveResult {
  location_name: string;
  geo: { lat: number; lng: number };
  supers: Partial<Record<SuperKey, Store[]>>;
}

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

// ─── Cart ─────────────────────────────────────────────────────────────────────

export interface CartItemEntry extends Product {
  cart_item_id: number;
  quantity: number;
  added_at: string;
}

export interface CartResult {
  cart_id: number;
  items: CartItemEntry[];
  item_count: number;
}

// ─── Compare multi-super ─────────────────────────────────────────────────────

export interface PromoOpportunity {
  shopping_id: number; // == cart_item_id in cart context
  missing_units: number;
  target_qty: number;
  best_super: string;
  best_product_id: number;
  effective_unit_price_at_target: number;
  current_best_unit_price: number;
  current_best_super: string;
  flips_super: boolean;
  promo_label: string;
}

export interface SuperMatch {
  super: string;
  product_id: number;
  name: string;
  /** EFFECTIVE line total after the best nth_unit promo (× qty). */
  price: number;
  matched_by: 'barcode' | 'name_similarity';
  /** Shelf price (COALESCE(offer,raw)) × qty — strike-through baseline. */
  unit_price: number;
  /** Best applied nth_unit promo label, or null. */
  promo_label: string | null;
  /** Informational 'other' promo labels (never folded into ranking). */
  info_badges: string[];
}

export interface CompareItem {
  shopping_id: number;
  name: string;
  home_super: string;
  /** Effective line total (after best nth_unit promo). */
  home_price: number;
  /**
   * Shelf TOTAL for the home product: COALESCE(offer_price, raw_price) × qty.
   * Mirrors SuperMatch.unit_price — the strike-through baseline before any promo.
   */
  home_unit_price: number;
  home_promo_label: string | null;
  home_info_badges: string[];
  matches: SuperMatch[];
  opportunity: PromoOpportunity | null;
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
