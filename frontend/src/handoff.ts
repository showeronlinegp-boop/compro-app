/**
 * Pure, side-effect-free VTEX cart-add deep-link builder.
 *
 * Accepts a list of {sku_id, qty} pairs and the storefront origin, returns a
 * HandoffResult with counts always populated. `result.url` is null when there is
 * nothing actionable (zero linkable items or URL-length guard hit before first item).
 * The caller uses `included` and `total` to render transparency counts regardless
 * of whether a URL was produced.
 *
 * URL-length guard: if the full URL exceeds 2000 characters the builder stops
 * appending items and marks `truncated = true`. The partial URL (and its counts)
 * are returned so the user can hand off at least a subset of their cart.
 *
 * Special case — empty items or no base URL: returns a zero-count result object
 * rather than null, so callers always get a stable shape for rendering.
 *
 * No React, no DOM — safe to call in useMemo, pure unit-testable.
 */

export interface HandoffItem {
  sku_id: string | null;
  qty: number;
}

export interface HandoffResult {
  /**
   * The cart-add deep link, or null when zero items survive sku filtering or the
   * URL-length guard fires before the first item can be appended.
   */
  url: string | null;
  /** Number of items whose sku/qty pair is in the URL. */
  included: number;
  /** Total items considered (input length, before sku filtering). */
  total: number;
  /** True when the URL-length guard stopped appending items early. */
  truncated: boolean;
}

/** Maximum URL length (in characters) before the builder stops adding items. */
const URL_LENGTH_LIMIT = 2000;

/**
 * Build a VTEX cart-add deep link for the given items.
 *
 * Always returns a HandoffResult — never throws, never returns bare null.
 * Check `result.url !== null` before rendering an anchor; use `result.included`
 * and `result.total` for transparency copy regardless of url presence.
 *
 * @param checkoutBaseUrl - VTEX storefront origin, e.g. "https://www.carrefour.com.ar".
 *   An empty/falsy value → `url: null`, counts are zero.
 * @param items - Array of {sku_id, qty} pairs. sku_id === null → item skipped.
 * @param salesChannel - VTEX sales channel (sc= param). Defaults to 1 (standard).
 *   VEA/Cencosud must pass 34 — sc=1 returns no regional sellers for VEA stores.
 */
export function buildHandoffUrl(
  checkoutBaseUrl: string,
  items: HandoffItem[],
  salesChannel: number = 1,
): HandoffResult {
  const total = items.length;

  // No base URL or empty list → zero-count result, no URL.
  if (!checkoutBaseUrl || total === 0) {
    return { url: null, included: 0, total, truncated: false };
  }

  const base = `${checkoutBaseUrl}/checkout/cart/add`;

  let url = base;
  let included = 0;
  let truncated = false;
  let firstParam = true;

  for (const item of items) {
    // Skip items with null / empty sku_id.
    if (!item.sku_id) continue;

    const clampedQty = Math.max(1, Math.floor(item.qty));
    const sku = encodeURIComponent(item.sku_id);
    const separator = firstParam ? '?' : '&';
    const segment = `${separator}sku=${sku}&qty=${clampedQty}&seller=1&sc=${salesChannel}`;

    // Check URL length BEFORE appending.
    if ((url + segment).length > URL_LENGTH_LIMIT) {
      truncated = true;
      break;
    }

    url += segment;
    included++;
    firstParam = false;
  }

  // Nothing made it into the URL — return counts but null url.
  if (included === 0) {
    return { url: null, included: 0, total, truncated };
  }

  return { url, included, total, truncated };
}
