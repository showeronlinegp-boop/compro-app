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
  barcode: string;
  name: string;
  image_url: string | null;
  super_count: number;
}

export interface ProductGroup {
  barcode: string;
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

      const conds: string[] = ["barcode IS NOT NULL AND barcode != ''", 'available = 1'];
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

      // Get all barcodes that appear in 2+ distinct supers
      const groupsSql = `
        SELECT barcode, MIN(name) as name, MIN(image_url) as image_url, COUNT(DISTINCT super) as super_count
        FROM products
        WHERE ${where}
        GROUP BY barcode
        HAVING COUNT(DISTINCT super) > 1
        ORDER BY name ASC
      `;

      const allGroups = db.prepare<unknown[], GroupSummaryRow>(groupsSql).all(...bindings);
      const total = allGroups.length;
      const pageGroups = allGroups.slice(offset, offset + limitNum);

      if (!pageGroups.length) {
        return { data: [], total: 0, page: pageNum, pages: 0 };
      }

      // Fetch all variants for the page's barcodes in one query
      const barcodes = pageGroups.map((g) => g.barcode);
      const placeholders = barcodes.map(() => '?').join(',');
      const rows = db
        .prepare<unknown[], ProductRow>(
          `SELECT * FROM products WHERE barcode IN (${placeholders}) AND available = 1 ORDER BY barcode, raw_price ASC`,
        )
        .all(...barcodes);

      // Group rows by barcode
      const byBarcode = new Map<string, Product[]>();
      for (const row of rows) {
        const key = row.barcode as string;
        if (!byBarcode.has(key)) byBarcode.set(key, []);
        byBarcode.get(key)?.push(parseRow(row));
      }

      const data: ProductGroup[] = pageGroups.map((g) => ({
        barcode: g.barcode,
        name: byBarcode.get(g.barcode)?.[0]?.name ?? g.name,
        image_url: byBarcode.get(g.barcode)?.[0]?.image_url ?? g.image_url,
        super_count: g.super_count,
        variants: byBarcode.get(g.barcode) ?? [],
      }));

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
