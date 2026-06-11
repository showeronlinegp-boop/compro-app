import type { Product, ProductRow, Promotion } from '../../../shared/types.js';

// Re-export for consumers that import from the domain layer
export type { Product, ProductRow };

function tryParse<T>(v: string | null): T[] {
  try {
    return JSON.parse(v ?? '[]') as T[];
  } catch {
    return [];
  }
}

/**
 * Converts a raw DB row to the API Product shape:
 *   - available:  0|1 integer  → boolean
 *   - categories: JSON string  → string[]
 *   - promotions: JSON string  → Promotion[]
 */
export function parseRow(row: ProductRow): Product {
  return {
    ...row,
    available: Boolean(row.available),
    categories: tryParse<string>(row.categories),
    promotions: tryParse<Promotion>(row.promotions),
  };
}
