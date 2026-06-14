import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { buildNameSearch } from '../../../shared/text.js';
import type { Product, ProductRow } from '../../../shared/types.js';
import { parseRow } from '../domain/product.js';
import type { ProductQueryParams } from '../domain/query.js';
import { groupOrderBy, parseSort, rowOrderBy } from '../domain/sort.js';

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
  super_count: number | bigint;
  max_discount: number;
  min_price: number | null;
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
  search(params: ProductQueryParams): Promise<ProductListResult>;
  getGroups(params: {
    q?: string;
    category?: string;
    discount?: string;
    super?: string;
    sort?: string;
    page?: string;
    limit?: string;
    vtexStrings?: string[];
  }): Promise<GroupsResult>;
  getCategories(): Array<{ slug: string; label: string; icon: string }>;
}

// ─── GKEY expression ──────────────────────────────────────────────────────────

// Compute GKEY in JS to match SQL: barcode when non-empty, else "id:<id>"
function computeGkey(row: { barcode: string | null; id: number }): string {
  return row.barcode && row.barcode !== '' ? row.barcode : `id:${row.id}`;
}

// ─── Repo factory ─────────────────────────────────────────────────────────────

// Accept PrismaClient or TransactionClient (both expose model delegates + $queryRaw)
type PrismaLike = Pick<
  PrismaClient,
  '$queryRaw' | '$executeRaw'
>;

export function makeCatalogRepo(prisma: PrismaLike): CatalogRepo {
  return {
    async search(params) {
      const pageNum = Math.max(1, Number.parseInt(params.page ?? '1') || 1);
      const limitNum = Math.min(100, Number.parseInt(params.limit ?? '48') || 48);
      const offset = (pageNum - 1) * limitNum;

      const whereParts: Prisma.Sql[] = [];

      if (params.q) {
        const nameFragment = buildNameSearch(params.q);
        if (nameFragment) whereParts.push(nameFragment);
      }

      if (params.super) {
        whereParts.push(Prisma.sql`super = ${params.super}`);
      }

      if (params.category) {
        const vtex = params.vtexStrings ?? [];
        if (vtex.length > 0) {
          const orParts = vtex.map((s) => Prisma.sql`categories::text ILIKE ${'%' + s + '%'}`);
          whereParts.push(Prisma.sql`(${Prisma.join(orParts, ' OR ')})`);
        }
      }

      if (params.category_key) {
        whereParts.push(Prisma.sql`category_key = ${params.category_key}`);
      }

      if (params.discount === '1') {
        whereParts.push(Prisma.sql`discount_pct > 0`);
      }

      if (params.available === '1') {
        whereParts.push(Prisma.sql`available = true`);
      }

      const where =
        whereParts.length > 0
          ? Prisma.sql`WHERE ${Prisma.join(whereParts, ' AND ')}`
          : Prisma.sql``;

      const orderBy = Prisma.raw(rowOrderBy(parseSort(params.sort)));

      const [countResult, rows] = await Promise.all([
        (prisma as PrismaClient).$queryRaw<Array<{ total: bigint }>>(
          Prisma.sql`SELECT COUNT(*) as total FROM products ${where}`,
        ),
        (prisma as PrismaClient).$queryRaw<ProductRow[]>(
          Prisma.sql`SELECT * FROM products ${where} ORDER BY ${orderBy} LIMIT ${limitNum} OFFSET ${offset}`,
        ),
      ]);

      const total = Number((countResult[0] as { total: bigint })?.total ?? 0);
      const data = rows.map(parseRow);

      return {
        data,
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
      };
    },

    async getGroups(params) {
      const pageNum = Math.max(1, Number.parseInt(params.page ?? '1') || 1);
      const limitNum = Math.min(100, Number.parseInt(params.limit ?? '24') || 24);
      const offset = (pageNum - 1) * limitNum;

      // GKEY: barcode when present and non-empty, else "id:" || id
      const GKEY = Prisma.raw("COALESCE(NULLIF(barcode, ''), 'id:' || id)");

      const whereParts: Prisma.Sql[] = [Prisma.sql`available = true`];

      if (params.q) {
        const nameFragment = buildNameSearch(params.q);
        if (nameFragment) whereParts.push(nameFragment);
      }

      if (params.category) {
        const vtex = params.vtexStrings ?? [];
        if (vtex.length > 0) {
          const orParts = vtex.map((s) => Prisma.sql`categories::text ILIKE ${'%' + s + '%'}`);
          whereParts.push(Prisma.sql`(${Prisma.join(orParts, ' OR ')})`);
        }
      }

      if (params.discount === '1') {
        whereParts.push(Prisma.sql`discount_pct > 0`);
      }

      const where = Prisma.sql`WHERE ${Prisma.join(whereParts, ' AND ')}`;

      // HAVING clause for super filter (groups containing the chosen super)
      const havingParts: Prisma.Sql[] = [];
      if (params.super) {
        havingParts.push(
          Prisma.sql`SUM(CASE WHEN super = ${params.super} THEN 1 ELSE 0 END) > 0`,
        );
      }
      const having =
        havingParts.length > 0
          ? Prisma.sql`HAVING ${Prisma.join(havingParts, ' AND ')}`
          : Prisma.sql``;

      const orderBy = Prisma.raw(groupOrderBy(parseSort(params.sort)));

      // Total distinct groups
      const countResult = await (prisma as PrismaClient).$queryRaw<Array<{ total: bigint }>>(
        Prisma.sql`
          SELECT COUNT(*) as total FROM (
            SELECT 1 FROM products ${where} GROUP BY ${GKEY} ${having}
          ) _count
        `,
      );
      const total = Number((countResult[0] as { total: bigint })?.total ?? 0);

      if (total === 0) {
        return { data: [], total: 0, page: pageNum, pages: 0 };
      }

      // Page groups summary
      const pageGroups = await (prisma as PrismaClient).$queryRaw<GroupSummaryRow[]>(
        Prisma.sql`
          SELECT ${GKEY} AS gkey,
                 MIN(name) as name,
                 MIN(image_url) as image_url,
                 COUNT(DISTINCT super) as super_count,
                 MAX(discount_pct) as max_discount,
                 MIN(COALESCE(offer_price, raw_price)) as min_price
          FROM products
          ${where}
          GROUP BY ${GKEY}
          ${having}
          ORDER BY ${orderBy}
          LIMIT ${limitNum} OFFSET ${offset}
        `,
      );

      if (pageGroups.length === 0) {
        return { data: [], total, page: pageNum, pages: Math.ceil(total / limitNum) };
      }

      // Fetch all variants for the page's group keys in one query
      const keys = pageGroups.map((g) => g.gkey);
      const keyList = Prisma.join(keys.map((k) => Prisma.sql`${k}`));
      const rows = await (prisma as PrismaClient).$queryRaw<ProductRow[]>(
        Prisma.sql`
          SELECT * FROM products
          WHERE ${GKEY} IN (${keyList})
            AND available = true
          ORDER BY raw_price ASC
        `,
      );

      // Group rows by GKEY (computed in JS to match SQL)
      const byKey = new Map<string, Product[]>();
      for (const row of rows) {
        const k = computeGkey(row as { barcode: string | null; id: number });
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
          super_count: Number(g.super_count),
          variants,
        };
      });

      return { data, total, page: pageNum, pages: Math.ceil(total / limitNum) };
    },

    getCategories() {
      // Taxonomy injected at route layer — not repo responsibility
      return [];
    },
  };
}
