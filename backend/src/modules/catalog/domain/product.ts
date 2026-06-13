import type { Product, ProductRow, Promotion } from '../../../shared/types.js';

// Re-export for consumers that import from the domain layer
export type { Product, ProductRow };

/**
 * tryParse: handle both the Postgres path (jsonb returned as parsed array already)
 * and the legacy path (JSON string from SQLite, kept for test-compat).
 * Returns T[] or [] on failure.
 */
function tryParse<T>(v: unknown[] | string | null | undefined): T[] {
  if (v === null || v === undefined) return [];
  if (Array.isArray(v)) return v as T[];
  try {
    return JSON.parse(v as string) as T[];
  } catch {
    return [];
  }
}

/**
 * Converts a raw DB row to the API Product shape:
 *   - available:   boolean (Postgres) or 0|1 (legacy coercion)
 *   - categories:  jsonb array (Postgres) or JSON string (legacy) → string[]
 *   - promotions:  jsonb array (Postgres) or JSON string (legacy) → Promotion[]
 *   - synced_at:   Date (Postgres Timestamptz) or string (legacy) → ISO string
 */
export function parseRow(row: ProductRow): Product {
  return {
    ...row,
    available: Boolean(row.available),
    categories: tryParse<string>(row.categories as unknown[] | string | null),
    promotions: tryParse<Promotion>(row.promotions as unknown[] | string | null),
    synced_at:
      row.synced_at instanceof Date ? row.synced_at.toISOString() : (row.synced_at as string),
  };
}
