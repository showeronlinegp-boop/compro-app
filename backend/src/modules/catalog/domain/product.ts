import type { Product, ProductRow } from '../../../shared/types.js';

// Re-export for consumers that import from the domain layer
export type { Product, ProductRow };

function tryParse(v: string | null): string[] {
  try {
    return JSON.parse(v ?? '[]') as string[];
  } catch {
    return [];
  }
}

/**
 * Converts a raw DB row to the API Product shape:
 *   - available: 0|1 integer → boolean
 *   - categories: JSON string|null → string[]
 */
export function parseRow(row: ProductRow): Product {
  return {
    ...row,
    available: Boolean(row.available),
    categories: tryParse(row.categories),
  };
}
