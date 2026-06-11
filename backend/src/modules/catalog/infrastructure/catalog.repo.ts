import type Database from 'better-sqlite3';
import type { Product, ProductRow } from '../../../shared/types.js';
import { parseRow } from '../domain/product.js';
import { type ProductQueryParams, buildProductsQuery } from '../domain/query.js';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface ProductListResult {
  data: Product[];
  total: number;
  page: number;
  pages: number;
}

export interface GroupSummaryRow {
  gkey: string;
  name: string;
  image_url: string | null;
  super_count: number;
}

export interface ProductGroup {
  /** Stable grouping key: barcode when present, else "id:<rowid>" for barcode-less singletons. */
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

export interface CatalogRepo {
  search(params: ProductQueryParams): ProductListResult;
  getGroups(params: {
    q?: string;
    category?: string;
    discount?: string;
    super?: string;
    page?: string;
    limit?: string;
    vtexStrings?: string[];
  }): GroupsResult;
  getCategories(): Array<{ slug: string; label: string; icon: string }>;
}

// ─── Repo factory ─────────────────────────────────────────────────────────────

export function makeCatalogRepo(db: Database.Database): CatalogRepo {
  return {
    search(params) {
      const { sql, bindings, countSql, page, limit } = buildProductsQuery(params);

      const countRow = db.prepare<unknown[], { total: number }>(countSql).get(...bindings);
      const total = Number(countRow?.total ?? 0);

      const rows = db.prepare<unknown[], ProductRow>(sql).all(...bindings);
      const data = rows.map(parseRow);

      return {
        data,
        total,
        page,
        pages: Math.ceil(total / limit),
      };
    },

    getGroups(params) {
      const pageNum = Math.max(1, Number.parseInt(params.page ?? '1') || 1);
      const limitNum = Math.min(100, Number.parseInt(params.limit ?? '24') || 24);
      const offset = (pageNum - 1) * limitNum;

      // group_key: barcode when present, else a unique per-row key so barcode-less
      // products surface as their own singleton group (instead of all collapsing
      // into a single NULL group under GROUP BY). The "id:" prefix can never
      // collide with a real (numeric) barcode.
      const GKEY = "COALESCE(NULLIF(barcode, ''), 'id:' || id)";

      const conds: string[] = ['available = 1'];
      const bindings: unknown[] = [];

      if (params.q) {
        conds.push('name LIKE ?');
        bindings.push(`%${params.q}%`);
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

      const where = conds.join(' AND ');

      // "Include super": keep groups that contain at least one row from the chosen
      // super, WITHOUT filtering rows by super — so the card still shows every
      // super's price for comparison.
      const havingParts: string[] = [];
      const havingBindings: unknown[] = [];
      if (params.super) {
        havingParts.push('SUM(CASE WHEN super = ? THEN 1 ELSE 0 END) > 0');
        havingBindings.push(params.super);
      }
      const having = havingParts.length ? `HAVING ${havingParts.join(' AND ')}` : '';

      // Total distinct groups (NOT rows) — paginate on groups, in SQL.
      const countSql = `
        SELECT COUNT(*) as total FROM (
          SELECT 1 FROM products WHERE ${where} GROUP BY ${GKEY} ${having}
        )
      `;
      const countRow = db
        .prepare<unknown[], { total: number }>(countSql)
        .get(...bindings, ...havingBindings);
      const total = Number(countRow?.total ?? 0);

      if (total === 0) {
        return { data: [], total: 0, page: pageNum, pages: 0 };
      }

      const groupsSql = `
        SELECT ${GKEY} AS gkey, MIN(name) as name, MIN(image_url) as image_url,
               COUNT(DISTINCT super) as super_count
        FROM products
        WHERE ${where}
        GROUP BY gkey
        ${having}
        ORDER BY super_count DESC, name ASC
        LIMIT ${limitNum} OFFSET ${offset}
      `;
      const pageGroups = db
        .prepare<unknown[], GroupSummaryRow>(groupsSql)
        .all(...bindings, ...havingBindings);

      // Fetch all variants (every super) for the page's group keys in one query.
      const keys = pageGroups.map((g) => g.gkey);
      const placeholders = keys.map(() => '?').join(',');
      const rows = db
        .prepare<unknown[], ProductRow>(
          `SELECT * FROM products WHERE ${GKEY} IN (${placeholders}) AND available = 1 ORDER BY raw_price ASC`,
        )
        .all(...keys);

      // Group rows by the SAME group_key expression, computed in JS to match SQL.
      const byKey = new Map<string, Product[]>();
      for (const row of rows) {
        const k = row.barcode && row.barcode !== '' ? row.barcode : `id:${row.id}`;
        if (!byKey.has(k)) byKey.set(k, []);
        byKey.get(k)?.push(parseRow(row));
      }

      const data: ProductGroup[] = pageGroups.map((g) => {
        const variants = byKey.get(g.gkey) ?? [];
        return {
          key: g.gkey,
          barcode: variants[0]?.barcode ?? null,
          name: variants[0]?.name ?? g.name,
          image_url: variants[0]?.image_url ?? g.image_url,
          super_count: g.super_count,
          variants,
        };
      });

      return { data, total, page: pageNum, pages: Math.ceil(total / limitNum) };
    },

    // getCategories is a pure taxonomy read — taxonomy passed in from the route layer
    getCategories() {
      // This method exists for structural completeness but the taxonomy is injected
      // at the route level (catalog.routes.ts receives taxonomy as a dep).
      // Returning empty here; caller should use the taxonomy dep directly.
      return [];
    },
  };
}
