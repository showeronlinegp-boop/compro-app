import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { CartItem } from '../domain/cart.js';
import { parseQty } from '../domain/cart.js';

interface CartRow {
  shopping_id: number;
  sku_id: string;
  qty_notes: string | null;
  name: string;
}

export interface CartRepo {
  getItemsForSuper(superKey: string): Promise<{ found: CartItem[]; missing: string[] }>;
}

export function makeCartRepo(prisma: PrismaClient): CartRepo {
  return {
    async getItemsForSuper(superKey) {
      // 1. Items already from the target super
      const homeRows = await prisma.$queryRaw<CartRow[]>(Prisma.sql`
        SELECT s.id AS shopping_id, p.sku_id, s.notes AS qty_notes, p.name
        FROM shopping s
        JOIN products p ON p.id = s.product_id
        WHERE p.super = ${superKey} AND p.sku_id IS NOT NULL AND p.available = true
      `);

      const foundIds = new Set(homeRows.map((r) => Number(r.shopping_id)));

      // 2. Items not from the target super → try barcode match first
      const barcodeRows = await prisma.$queryRaw<CartRow[]>(Prisma.sql`
        SELECT DISTINCT ON (s.id)
          s.id AS shopping_id, p2.sku_id, s.notes AS qty_notes, p2.name
        FROM shopping s
        JOIN products p  ON p.id = s.product_id  AND p.super != ${superKey}
        JOIN products p2 ON p2.barcode = p.barcode
                        AND p2.super = ${superKey}
                        AND p2.sku_id IS NOT NULL
                        AND p2.available = true
                        AND p2.barcode IS NOT NULL
                        AND p2.barcode != ''
        WHERE COALESCE(p.offer_price, p.raw_price) IS NOT NULL
      `);

      for (const r of barcodeRows) foundIds.add(Number(r.shopping_id));

      // 3. Remaining → name similarity match within same category
      const allShoppingIds = await prisma.$queryRaw<Array<{ id: number; notes: string | null; name: string }>>(
        Prisma.sql`
          SELECT s.id, s.notes, p.name
          FROM shopping s
          JOIN products p ON p.id = s.product_id
        `,
      );
      const needSimilarity = allShoppingIds
        .map((r) => Number(r.id))
        .filter((id) => !foundIds.has(id));

      let similarityRows: CartRow[] = [];
      if (needSimilarity.length > 0) {
        similarityRows = await prisma.$queryRaw<CartRow[]>(Prisma.sql`
          SELECT DISTINCT ON (s.id)
            s.id AS shopping_id, p2.sku_id, s.notes AS qty_notes, p2.name
          FROM shopping s
          JOIN products p  ON p.id = s.product_id
          JOIN products p2 ON p2.super = ${superKey}
                          AND p2.category_key = p.category_key
                          AND p2.category_key IS NOT NULL
                          AND p2.sku_id IS NOT NULL
                          AND p2.available = true
                          AND COALESCE(p2.offer_price, p2.raw_price) IS NOT NULL
                          AND similarity(
                                regexp_replace(lower(immutable_unaccent(p.name)), '[^a-z0-9]+', ' ', 'g'),
                                regexp_replace(lower(immutable_unaccent(p2.name)), '[^a-z0-9]+', ' ', 'g')
                              ) > 0.35
          WHERE s.id IN (${Prisma.join(needSimilarity)})
          ORDER BY s.id, similarity(
            regexp_replace(lower(immutable_unaccent(p.name)), '[^a-z0-9]+', ' ', 'g'),
            regexp_replace(lower(immutable_unaccent(p2.name)), '[^a-z0-9]+', ' ', 'g')
          ) DESC
        `);
      }

      const allFound = [...homeRows, ...barcodeRows, ...similarityRows];
      const foundShoppingIds = new Set(allFound.map((r) => Number(r.shopping_id)));
      const missing = allShoppingIds
        .filter((r) => !foundShoppingIds.has(Number(r.id)))
        .map((r) => r.name);

      const found: CartItem[] = allFound.map((r) => ({
        skuId: r.sku_id,
        qty: parseQty(r.qty_notes),
        name: r.name,
      }));

      return { found, missing };
    },
  };
}
