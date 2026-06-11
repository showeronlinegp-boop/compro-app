/**
 * Pure query builder for the products search endpoint.
 * No IO — fully unit-testable.
 *
 * Mirrors the query-building logic in backend/routes/products.js exactly:
 *   - q           → name LIKE %value%
 *   - super       → super = value
 *   - category    → one OR clause per vtex string (categories LIKE %s%)
 *   - discount    → discount_pct > 0  (only when '1')
 *   - available   → available = 1     (only when '1')
 *   - page/limit  → LIMIT/OFFSET (LIMIT/OFFSET are inlined as integers, not params)
 */

export interface ProductQueryParams {
  q?: string;
  super?: string;
  category?: string;
  discount?: string;
  available?: string;
  page?: string;
  limit?: string;
  /** vtex strings for the given category slug — resolved by caller */
  vtexStrings?: string[];
}

export interface BuiltQuery {
  /** Full SELECT query (pagination included) */
  sql: string;
  /** WHERE-only bindings (no LIMIT/OFFSET — those are inlined) */
  bindings: unknown[];
  /** COUNT query for total */
  countSql: string;
  /** Parsed, validated page number (>= 1) */
  page: number;
  /** Parsed, validated limit (1–100) */
  limit: number;
}

export function buildProductsQuery(params: ProductQueryParams): BuiltQuery {
  const pageNum = Math.max(1, Number.parseInt(params.page ?? '1') || 1);
  const limitNum = Math.min(100, Number.parseInt(params.limit ?? '48') || 48);
  const offset = (pageNum - 1) * limitNum;

  const conds: string[] = ['1=1'];
  const bindings: unknown[] = [];

  if (params.q) {
    conds.push('name LIKE ?');
    bindings.push(`%${params.q}%`);
  }

  if (params.super) {
    conds.push('super = ?');
    bindings.push(params.super);
  }

  if (params.category) {
    const vtex = params.vtexStrings ?? [];
    if (vtex.length > 0) {
      conds.push(`(${vtex.map(() => 'categories LIKE ?').join(' OR ')})`);
      for (const s of vtex) bindings.push(`%${s}%`);
    }
  }

  if (params.discount === '1') {
    conds.push('discount_pct > 0');
  }

  if (params.available === '1') {
    conds.push('available = 1');
  }

  const where = conds.join(' AND ');

  // LIMIT/OFFSET are int-validated and inlined — NOT bound params.
  // This matches the legacy products.js behavior exactly.
  const sql = `SELECT * FROM products WHERE ${where} ORDER BY discount_pct DESC, name ASC LIMIT ${limitNum} OFFSET ${offset}`;
  const countSql = `SELECT COUNT(*) as total FROM products WHERE ${where}`;

  return { sql, bindings, countSql, page: pageNum, limit: limitNum };
}
