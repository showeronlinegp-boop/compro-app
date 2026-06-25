import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { CompareItem, SourceRow, SuperMatch } from '../../../shared/types.js';

// ─── Internal row types ───────────────────────────────────────────────────────

interface ProductBaseRow {
  product_id: number;
  name: string;
  home_super: string;
  barcode: string | null;
  category_key: string | null;
  home_price: number | null;
}

interface MatchRow {
  product_id: number;
  match_product_id: number;
  match_super: string;
  match_name: string;
  match_price: number;
  matched_by: 'barcode' | 'name_similarity';
}

interface ShoppingRow {
  shopping_id: number;
  product_id: number;
}

// ─── Repo interface ───────────────────────────────────────────────────────────

export interface CompareRepo {
  buildCompareItems(): Promise<CompareItem[]>;
  buildCompareItemsFromSource(source: SourceRow[]): Promise<CompareItem[]>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function makeCompareRepo(prisma: PrismaClient): CompareRepo {
  return {
    async buildCompareItemsFromSource(source: SourceRow[]): Promise<CompareItem[]> {
      if (source.length === 0) return [];

      const productIds = [...new Set(source.map((s) => s.product_id))];

      // Load base product rows (anchor on p.id IN product_ids)
      const baseRows = await prisma.$queryRaw<ProductBaseRow[]>(Prisma.sql`
        SELECT
          p.id AS product_id,
          p.name,
          p.super AS home_super,
          p.barcode,
          p.category_key,
          COALESCE(p.offer_price, p.raw_price) AS home_price
        FROM products p
        WHERE p.id IN (${Prisma.join(productIds)})
          AND COALESCE(p.offer_price, p.raw_price) IS NOT NULL
      `);

      if (baseRows.length === 0) return [];

      // Build product_id → base row map
      const baseByProductId = new Map<number, ProductBaseRow>();
      for (const r of baseRows) {
        baseByProductId.set(Number(r.product_id), r);
      }

      // ── Barcode matching (exact, cross-super) ──────────────────────────────

      const barcodeMatches = await prisma.$queryRaw<MatchRow[]>(Prisma.sql`
        SELECT
          p.id AS product_id,
          p2.id AS match_product_id,
          p2.super AS match_super,
          p2.name AS match_name,
          COALESCE(p2.offer_price, p2.raw_price) AS match_price,
          'barcode' AS matched_by
        FROM products p
        JOIN products p2 ON p2.barcode = p.barcode
                         AND p2.barcode IS NOT NULL
                         AND p2.barcode != ''
                         AND p2.super != p.super
                         AND p2.available = true
                         AND COALESCE(p2.offer_price, p2.raw_price) IS NOT NULL
        WHERE p.id IN (${Prisma.join(productIds)})
      `);

      // product_ids that already have barcode matches (at least one super)
      const withBarcodeMatch = new Set(barcodeMatches.map((r) => Number(r.product_id)));

      // ── Name similarity matching for products without barcode matches ──────

      const productIdsNeedingSimilarity = productIds.filter(
        (pid) => !withBarcodeMatch.has(pid) && baseByProductId.get(pid)?.category_key,
      );

      let similarityMatches: MatchRow[] = [];

      if (productIdsNeedingSimilarity.length > 0) {
        similarityMatches = await prisma.$queryRaw<MatchRow[]>(Prisma.sql`
          SELECT DISTINCT ON (p.id, p2.super)
            p.id AS product_id,
            p2.id AS match_product_id,
            p2.super AS match_super,
            p2.name AS match_name,
            COALESCE(p2.offer_price, p2.raw_price) AS match_price,
            'name_similarity' AS matched_by
          FROM products p
          JOIN products p2
            ON p2.super != p.super
           AND p2.available = true
           AND p2.category_key = p.category_key
           AND p2.category_key IS NOT NULL
           AND COALESCE(p2.offer_price, p2.raw_price) IS NOT NULL
           AND similarity(
                 regexp_replace(lower(immutable_unaccent(p.name)), '[^a-z0-9]+', ' ', 'g'),
                 regexp_replace(lower(immutable_unaccent(p2.name)), '[^a-z0-9]+', ' ', 'g')
               ) > 0.35
          WHERE p.id IN (${Prisma.join(productIdsNeedingSimilarity)})
          ORDER BY p.id, p2.super,
            similarity(
              regexp_replace(lower(immutable_unaccent(p.name)), '[^a-z0-9]+', ' ', 'g'),
              regexp_replace(lower(immutable_unaccent(p2.name)), '[^a-z0-9]+', ' ', 'g')
            ) DESC
        `);
      }

      const allMatches = [...barcodeMatches, ...similarityMatches];

      // ── Build product_id → SuperMatch[] map (unit prices, pre-dedup) ────────

      const matchesByProductId = new Map<number, SuperMatch[]>();
      for (const m of allMatches) {
        const pid = Number(m.product_id);
        const list = matchesByProductId.get(pid) ?? [];
        list.push({
          super: m.match_super,
          product_id: Number(m.match_product_id),
          name: m.match_name,
          price: Number(m.match_price), // unit price — multiplied per-row below
          matched_by: m.matched_by,
        });
        matchesByProductId.set(pid, list);
      }

      // ── Iterate source rows — one CompareItem per SourceRow ─────────────────

      const result: CompareItem[] = [];

      for (const s of source) {
        const base = baseByProductId.get(s.product_id);
        if (!base) continue; // product has no priced row — skip silently

        const qty = s.quantity;
        const unitHomePrice = Number(base.home_price);
        const externalUnitMatches = matchesByProductId.get(s.product_id) ?? [];

        const homeMatch: SuperMatch = {
          super: base.home_super,
          product_id: s.product_id,
          name: base.name,
          price: unitHomePrice, // dedup first at unit level, then multiply
          matched_by: 'barcode',
        };

        // Merge home + external matches, dedup per super (keep cheapest unit price)
        const bySuperMap = new Map<string, SuperMatch>();
        for (const m of [homeMatch, ...externalUnitMatches]) {
          const existing = bySuperMap.get(m.super);
          if (!existing || m.price < existing.price) {
            bySuperMap.set(m.super, m);
          }
        }

        // Apply quantity multiplication after dedup
        const dedupedMatches = [...bySuperMap.values()].map((m) => ({
          ...m,
          price: m.price * qty,
        }));

        result.push({
          shopping_id: s.item_id,
          name: base.name,
          home_super: base.home_super,
          home_price: unitHomePrice * qty,
          matches: dedupedMatches,
        });
      }

      return result;
    },

    async buildCompareItems(): Promise<CompareItem[]> {
      // Fetch shopping rows → map to SourceRow (quantity=1) → delegate
      const shoppingRows = await prisma.$queryRaw<ShoppingRow[]>(Prisma.sql`
        SELECT s.id AS shopping_id, s.product_id
        FROM shopping s
        JOIN products p ON s.product_id = p.id
        WHERE COALESCE(p.offer_price, p.raw_price) IS NOT NULL
      `);

      const source: SourceRow[] = shoppingRows.map((r) => ({
        item_id: Number(r.shopping_id),
        product_id: Number(r.product_id),
        quantity: 1,
      }));

      return this.buildCompareItemsFromSource(source);
    },
  };
}
