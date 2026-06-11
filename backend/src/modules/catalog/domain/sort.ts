/**
 * Sort handling for the catalog endpoints — pure, no IO, fully unit-testable.
 *
 * The user-facing `sort` query param is NEVER interpolated into SQL directly.
 * It is validated against a fixed whitelist and mapped to a hardcoded ORDER BY
 * clause, so there is no injection surface.
 *
 * "Effective price" for ranking = offer_price when present, else raw_price.
 * Conditional promos ("2do al 80%", "2x1") never lower the single-unit price
 * (see Promotion type) and are computed client-side, so they intentionally do
 * NOT participate in SQL price ordering.
 */

export type SortKey = 'relevance' | 'discount_desc' | 'price_asc' | 'price_desc';

const VALID: readonly SortKey[] = ['relevance', 'discount_desc', 'price_asc', 'price_desc'];

/** Validate the raw query param, falling back to the default ('relevance'). */
export function parseSort(value: string | null | undefined): SortKey {
  return value != null && (VALID as readonly string[]).includes(value)
    ? (value as SortKey)
    : 'relevance';
}

/** Per-row effective price for the flat /products endpoint. */
const ROW_PRICE = 'COALESCE(offer_price, raw_price)';

/**
 * ORDER BY clause for the flat /products endpoint (per-row).
 * NULL prices always sort last regardless of direction.
 */
export function rowOrderBy(sort: SortKey): string {
  switch (sort) {
    case 'price_asc':
      return `${ROW_PRICE} IS NULL, ${ROW_PRICE} ASC, name ASC`;
    case 'price_desc':
      return `${ROW_PRICE} IS NULL, ${ROW_PRICE} DESC, name ASC`;
    case 'discount_desc':
      return 'discount_pct DESC, name ASC';
    default:
      return 'discount_pct DESC, name ASC';
  }
}

/**
 * ORDER BY clause for the grouped /products/groups endpoint.
 * Relies on the aggregate aliases `max_discount`, `min_price`, `super_count`
 * and `name` being present in the grouped SELECT.
 *
 *  - relevance     → discounted groups first, then by discount magnitude,
 *                    then by how many supers carry it, then alphabetical
 *  - discount_desc → strictly by best discount in the group
 *  - price_asc/desc→ by the group's lowest effective price (best price), NULLs last
 */
export function groupOrderBy(sort: SortKey): string {
  switch (sort) {
    case 'price_asc':
      return 'min_price IS NULL, min_price ASC, name ASC';
    case 'price_desc':
      return 'min_price IS NULL, min_price DESC, name ASC';
    case 'discount_desc':
      return 'max_discount DESC, name ASC';
    default:
      return 'max_discount > 0 DESC, max_discount DESC, super_count DESC, name ASC';
  }
}
