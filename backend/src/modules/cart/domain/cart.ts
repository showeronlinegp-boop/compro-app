/**
 * Cart domain helpers — pure functions, no side effects, no imports.
 */

/**
 * Returns the total item count as the sum of all quantities.
 * This is the badge source and the item_count field of CartResult.
 */
export function sumItemCount(items: { quantity: number }[]): number {
  return items.reduce((acc, item) => acc + item.quantity, 0);
}

/**
 * Validates and returns n if n >= 1.
 * Throws a statusCode-tagged Error (400) if n < 1.
 * Used by the repo to reject invalid quantity values.
 */
export function clampQty(n: number): number {
  if (n < 1) {
    throw Object.assign(new Error('La cantidad debe ser al menos 1'), { statusCode: 400 });
  }
  return n;
}
