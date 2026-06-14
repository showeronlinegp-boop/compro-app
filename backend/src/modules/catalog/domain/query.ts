/**
 * Pure query builder for the products search endpoint.
 * No IO — fully unit-testable.
 *
 * NOTE: This module generates SQL strings for documentation and unit-test
 * purposes. The actual catalog.repo.ts uses Prisma $queryRaw with Prisma.Sql
 * fragments directly — it does not call buildProductsQuery at runtime.
 *
 * Query-building logic for the products search endpoint:
 *   - q           → tokenized name search using Postgres immutable_unaccent expression
 *   - super       → super = value
 *   - category    → one OR clause per vtex string (categories::text ILIKE %s%)
 *   - discount    → discount_pct > 0  (only when '1')
 *   - available   → available = true  (only when '1')
 *   - page/limit  → LIMIT/OFFSET (LIMIT/OFFSET are inlined as integers, not params)
 */

import { normalizeSearchText } from '../../../shared/text.js';
import { parseSort, rowOrderBy } from './sort.js';

export interface ProductQueryParams {
  q?: string;
  super?: string;
  category?: string;
  category_key?: string;
  discount?: string;
  available?: string;
  /** relevance (default) | discount_desc | price_asc | price_desc */
  sort?: string;
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

/** Postgres column-side norm expression (must match GIN index expression in migration) */
const NORM_EXPR =
  "lower(regexp_replace(immutable_unaccent(name), '[^a-z0-9]+', ' ', 'g'))";

/**
 * Build the name search SQL fragment for a query string.
 * Returns {clause, bindings} or null when there are no tokens.
 */
function buildNameSearchSql(q: string): { clause: string; bindings: string[] } | null {
  const tokens = normalizeSearchText(q).split(' ').filter(Boolean);
  if (tokens.length === 0) return null;
  return {
    clause: tokens.map(() => `${NORM_EXPR} LIKE ?`).join(' AND '),
    bindings: tokens.map((t) => `%${t}%`),
  };
}

export function buildProductsQuery(params: ProductQueryParams): BuiltQuery {
  const pageNum = Math.max(1, Number.parseInt(params.page ?? '1') || 1);
  const limitNum = Math.min(100, Number.parseInt(params.limit ?? '48') || 48);
  const offset = (pageNum - 1) * limitNum;

  const conds: string[] = ['1=1'];
  const bindings: unknown[] = [];

  if (params.q) {
    const nameSearch = buildNameSearchSql(params.q);
    if (nameSearch) {
      conds.push(`(${nameSearch.clause})`);
      bindings.push(...nameSearch.bindings);
    }
  }

  if (params.super) {
    conds.push('super = ?');
    bindings.push(params.super);
  }

  if (params.category) {
    const vtex = params.vtexStrings ?? [];
    if (vtex.length > 0) {
      conds.push(`(${vtex.map(() => 'categories::text ILIKE ?').join(' OR ')})`);
      for (const s of vtex) bindings.push(`%${s}%`);
    }
  }

  if (params.discount === '1') {
    conds.push('discount_pct > 0');
  }

  if (params.available === '1') {
    conds.push('available = true');
  }

  const where = conds.join(' AND ');

  // sort is whitelisted in parseSort → rowOrderBy returns a hardcoded clause.
  const orderBy = rowOrderBy(parseSort(params.sort));

  // LIMIT/OFFSET are int-validated and inlined — NOT bound params.
  const sql = `SELECT * FROM products WHERE ${where} ORDER BY ${orderBy} LIMIT ${limitNum} OFFSET ${offset}`;
  const countSql = `SELECT COUNT(*) as total FROM products WHERE ${where}`;

  return { sql, bindings, countSql, page: pageNum, limit: limitNum };
}
