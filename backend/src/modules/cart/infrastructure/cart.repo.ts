import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { CartItem } from '../domain/cart.js';
import { parseQty } from '../domain/cart.js';

interface RecommendedRow {
  shopping_id: number;
  sku_id: string;
  qty_notes: string | null;
  name: string;
  price: number;
  min_price: number;
}

export interface CartRepo {
  // Returns only items where superKey has the cheapest (or tied-cheapest) price across all supers.
  getRecommendedItemsForSuper(superKey: string): Promise<{ found: CartItem[]; missing: string[] }>;
}

export function makeCartRepo(prisma: PrismaClient): CartRepo {
  return {
    async getRecommendedItemsForSuper(superKey) {
      // Single query: cross-super prices for every shopping item.
      // Returns items where the target super is cheapest (within 2% tolerance for ties).
      const rows = await prisma.$queryRaw<RecommendedRow[]>(Prisma.sql`
        WITH cross_prices AS (
          -- Best price for each shopping item × super combination
          -- Priority in ORDER BY: home product first, then barcode, then similarity
          SELECT DISTINCT ON (s.id, p2.super)
            s.id              AS shopping_id,
            s.notes           AS qty_notes,
            p2.super,
            p2.sku_id,
            p2.name,
            COALESCE(p2.offer_price, p2.raw_price) AS price
          FROM shopping s
          JOIN products p  ON p.id = s.product_id
          JOIN products p2 ON (
            p2.id = p.id
            OR (p2.barcode = p.barcode AND p2.barcode IS NOT NULL AND p2.barcode != '')
            OR (
              p2.category_key = p.category_key
              AND p2.category_key IS NOT NULL
              AND similarity(
                    regexp_replace(lower(immutable_unaccent(p.name)),  '[^a-z0-9]+', ' ', 'g'),
                    regexp_replace(lower(immutable_unaccent(p2.name)), '[^a-z0-9]+', ' ', 'g')
                  ) > 0.35
            )
          )
          WHERE p2.available = true
            AND p2.sku_id IS NOT NULL
            AND COALESCE(p2.offer_price, p2.raw_price) IS NOT NULL
          ORDER BY s.id, p2.super,
            CASE WHEN p2.id = p.id THEN 1
                 WHEN p2.barcode = p.barcode AND p2.barcode IS NOT NULL THEN 2
                 ELSE 3 END,
            COALESCE(p2.offer_price, p2.raw_price) ASC
        ),
        min_per_item AS (
          SELECT shopping_id, MIN(price) AS min_price
          FROM cross_prices
          GROUP BY shopping_id
        )
        SELECT
          cp.shopping_id,
          cp.sku_id,
          cp.qty_notes,
          cp.name,
          cp.price,
          mp.min_price
        FROM cross_prices cp
        JOIN min_per_item mp ON mp.shopping_id = cp.shopping_id
        WHERE cp.super = ${superKey}
          AND cp.price <= mp.min_price * 1.02
      `);

      // Items that exist in the shopping list but have no match in this super at all
      const allIds = await prisma.$queryRaw<Array<{ id: number; name: string }>>(Prisma.sql`
        SELECT s.id, p.name FROM shopping s JOIN products p ON p.id = s.product_id
      `);

      const foundIds = new Set(rows.map((r) => Number(r.shopping_id)));
      const missing = allIds
        .filter((r) => !foundIds.has(Number(r.id)))
        .map((r) => r.name);

      const found: CartItem[] = rows.map((r) => ({
        skuId: r.sku_id,
        qty: parseQty(r.qty_notes),
        name: r.name,
      }));

      return { found, missing };
    },
  };
}
