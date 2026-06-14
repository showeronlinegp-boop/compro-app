import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { CompareItem, SuperMatch } from '../../../shared/types.js';

interface ShoppingBaseRow {
  shopping_id: number;
  product_id: number;
  name: string;
  home_super: string;
  barcode: string | null;
  category_key: string | null;
  home_price: number | null;
}

interface MatchRow {
  shopping_id: number;
  match_product_id: number;
  match_super: string;
  match_name: string;
  match_price: number;
  matched_by: 'barcode' | 'name_similarity';
}

export interface CompareRepo {
  buildCompareItems(): Promise<CompareItem[]>;
}

export function makeCompareRepo(prisma: PrismaClient): CompareRepo {
  return {
    async buildCompareItems() {
      // Load all shopping items with their product info
      const baseRows = await prisma.$queryRaw<ShoppingBaseRow[]>(Prisma.sql`
        SELECT
          s.id AS shopping_id,
          p.id AS product_id,
          p.name,
          p.super AS home_super,
          p.barcode,
          p.category_key,
          COALESCE(p.offer_price, p.raw_price) AS home_price
        FROM shopping s
        JOIN products p ON s.product_id = p.id
        WHERE COALESCE(p.offer_price, p.raw_price) IS NOT NULL
      `);

      if (baseRows.length === 0) return [];

      // Barcode matching (exact, cross-super)
      const barcodeMatches = await prisma.$queryRaw<MatchRow[]>(Prisma.sql`
        SELECT
          s.id AS shopping_id,
          p2.id AS match_product_id,
          p2.super AS match_super,
          p2.name AS match_name,
          COALESCE(p2.offer_price, p2.raw_price) AS match_price,
          'barcode' AS matched_by
        FROM shopping s
        JOIN products p ON s.product_id = p.id
        JOIN products p2 ON p2.barcode = p.barcode
                         AND p2.barcode IS NOT NULL
                         AND p2.barcode != ''
                         AND p2.super != p.super
                         AND p2.available = true
                         AND COALESCE(p2.offer_price, p2.raw_price) IS NOT NULL
      `);

      // Collect shopping_ids that already have barcode matches (at least one super)
      const withBarcodeMatch = new Set(barcodeMatches.map((r) => Number(r.shopping_id)));

      // Name similarity matching for items without barcode matches
      const itemsNeedingSimilarity = baseRows.filter(
        (r) => !withBarcodeMatch.has(Number(r.shopping_id)) && r.category_key,
      );

      let similarityMatches: MatchRow[] = [];

      if (itemsNeedingSimilarity.length > 0) {
        const shoppingIds = itemsNeedingSimilarity.map((r) => Number(r.shopping_id));
        similarityMatches = await prisma.$queryRaw<MatchRow[]>(Prisma.sql`
          SELECT DISTINCT ON (s.id, p2.super)
            s.id AS shopping_id,
            p2.id AS match_product_id,
            p2.super AS match_super,
            p2.name AS match_name,
            COALESCE(p2.offer_price, p2.raw_price) AS match_price,
            'name_similarity' AS matched_by
          FROM shopping s
          JOIN products p ON s.product_id = p.id
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
          WHERE s.id IN (${Prisma.join(shoppingIds)})
          ORDER BY s.id, p2.super,
            similarity(
              regexp_replace(lower(immutable_unaccent(p.name)), '[^a-z0-9]+', ' ', 'g'),
              regexp_replace(lower(immutable_unaccent(p2.name)), '[^a-z0-9]+', ' ', 'g')
            ) DESC
        `);
      }

      const allMatches = [...barcodeMatches, ...similarityMatches];

      // Group matches by shopping_id
      const matchesByShoppingId = new Map<number, SuperMatch[]>();
      for (const m of allMatches) {
        const id = Number(m.shopping_id);
        const list = matchesByShoppingId.get(id) ?? [];
        list.push({
          super: m.match_super,
          product_id: Number(m.match_product_id),
          name: m.match_name,
          price: Number(m.match_price),
          matched_by: m.matched_by,
        });
        matchesByShoppingId.set(id, list);
      }

      // Build CompareItems including the home super as a match
      return baseRows.map((r): CompareItem => {
        const id = Number(r.shopping_id);
        const externalMatches = matchesByShoppingId.get(id) ?? [];

        const homeMatch: SuperMatch = {
          super: r.home_super,
          product_id: Number(r.product_id),
          name: r.name,
          price: Number(r.home_price),
          matched_by: 'barcode',
        };

        // Merge home match + external matches, deduplicate by super (keep cheapest)
        const bySuperMap = new Map<string, SuperMatch>();
        for (const m of [homeMatch, ...externalMatches]) {
          const existing = bySuperMap.get(m.super);
          if (!existing || m.price < existing.price) {
            bySuperMap.set(m.super, m);
          }
        }

        return {
          shopping_id: id,
          name: r.name,
          home_super: r.home_super,
          home_price: Number(r.home_price),
          matches: [...bySuperMap.values()],
        };
      });
    },
  };
}
