import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type {
  CartItemEntry,
  CartResult,
  CompareResult,
  ProductRow,
  Promotion,
  SourceRow,
} from '../../../shared/types.js';
import { buildCompareResult } from '../../compare/domain/matcher.js';
import type { CompareRepo } from '../../compare/infrastructure/compare.repo.js';
import { clampQty, sumItemCount } from '../domain/cart.js';

// ─── Row types from JOIN queries ──────────────────────────────────────────────

interface CartItemRow extends ProductRow {
  cart_item_id: number;
  quantity: number;
  added_at: string | Date;
}

// ─── Row parser ───────────────────────────────────────────────────────────────

function tryParse<T>(v: unknown[] | string | null | undefined): T[] {
  if (v === null || v === undefined) return [];
  if (Array.isArray(v)) return v as T[];
  try {
    return JSON.parse(v as string) as T[];
  } catch {
    return [];
  }
}

function parseCartItemRow(row: CartItemRow): CartItemEntry {
  const { cart_item_id, quantity, added_at, ...rest } = row;
  return {
    cart_item_id: Number(cart_item_id),
    quantity: Number(quantity),
    added_at: added_at instanceof Date ? added_at.toISOString() : (added_at as string),
    ...rest,
    categories: tryParse<string>(rest.categories as unknown[] | string | null),
    promotions: tryParse<Promotion>(rest.promotions as unknown[] | string | null),
    available: Boolean(rest.available),
    synced_at:
      rest.synced_at instanceof Date ? rest.synced_at.toISOString() : (rest.synced_at as string),
  };
}

// ─── Repo interface ───────────────────────────────────────────────────────────

export interface CartRepo {
  getOrCreate(): Promise<CartResult>;
  addItem(product_id: number, quantity: number): Promise<CartResult>;
  updateQty(cart_item_id: number, quantity: number): Promise<CartResult>;
  removeItem(cart_item_id: number): Promise<CartResult>;
  clear(): Promise<CartResult>;
  compareCart(): Promise<CompareResult>;
}

// Accept PrismaClient or TransactionClient
type PrismaLike = Pick<PrismaClient, '$queryRaw' | '$executeRaw'> & {
  cart: PrismaClient['cart'];
  cart_items: PrismaClient['cart_items'];
  products: PrismaClient['products'];
};

// ─── Atomic single-cart resolver ──────────────────────────────────────────────
// Ensures exactly one cart row exists (id = 1). The upsert is idempotent:
// concurrent calls hit the same primary key and the DB serialises them safely.

// TODO(PR2): Replace this singleton with per-user cart.upsert({ where: { user_id }, ... }).
// user_id: 1 is a placeholder that keeps the schema valid until scoped repos are wired.
async function resolveCart(prisma: PrismaLike): Promise<{ id: number }> {
  return prisma.cart.upsert({
    where: { user_id: 1 },
    create: { user_id: 1 },
    update: {},
  });
}

// ─── Hydration helper ─────────────────────────────────────────────────────────

async function hydrateCart(prisma: PrismaLike, cart_id: number): Promise<CartResult> {
  // REQ-10 verification (cart-handoff): `p.*` includes `sku_id` from the products table.
  // ProductRow.sku_id: string | null is part of the spread in parseCartItemRow, so
  // CartItemEntry.sku_id is correctly returned in the GET /cart response. No change needed.
  const rows = await prisma.$queryRaw<CartItemRow[]>(Prisma.sql`
    SELECT
      ci.id AS cart_item_id,
      ci.quantity,
      ci.created_at AS added_at,
      p.*
    FROM cart_items ci
    JOIN products p ON ci.product_id = p.id
    WHERE ci.cart_id = ${cart_id}
    ORDER BY ci.created_at
  `);

  const items = rows.map(parseCartItemRow);
  return {
    cart_id,
    items,
    item_count: sumItemCount(items),
  };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function makeCartRepo(prisma: PrismaLike, compareRepo: CompareRepo): CartRepo {
  return {
    async getOrCreate() {
      const cart = await resolveCart(prisma);
      return hydrateCart(prisma, cart.id);
    },

    async addItem(product_id, quantity) {
      const product = await prisma.products.findUnique({ where: { id: product_id } });
      if (!product) {
        throw Object.assign(new Error('Producto no encontrado'), { statusCode: 404 });
      }

      clampQty(quantity);

      const cart = await resolveCart(prisma);

      await prisma.cart_items.upsert({
        where: {
          cart_id_product_id: { cart_id: cart.id, product_id },
        },
        create: { cart_id: cart.id, product_id, quantity },
        update: { quantity: { increment: quantity } },
      });

      return hydrateCart(prisma, cart.id);
    },

    async updateQty(cart_item_id, quantity) {
      clampQty(quantity);

      const item = await prisma.cart_items.findUnique({ where: { id: cart_item_id } });
      if (!item) {
        throw Object.assign(new Error('Item no encontrado'), { statusCode: 404 });
      }

      await prisma.cart_items.update({
        where: { id: cart_item_id },
        data: { quantity },
      });

      return hydrateCart(prisma, item.cart_id);
    },

    async removeItem(cart_item_id) {
      const item = await prisma.cart_items.findUnique({ where: { id: cart_item_id } });
      if (!item) {
        throw Object.assign(new Error('Item no encontrado'), { statusCode: 404 });
      }

      await prisma.cart_items.delete({ where: { id: cart_item_id } });

      return hydrateCart(prisma, item.cart_id);
    },

    async clear() {
      const cart = await resolveCart(prisma);
      await prisma.cart_items.deleteMany({ where: { cart_id: cart.id } });
      return hydrateCart(prisma, cart.id);
    },

    async compareCart(): Promise<CompareResult> {
      const cart = await resolveCart(prisma);
      const cartResult = await hydrateCart(prisma, cart.id);

      // Guard: refuse to compare carts with more than 100 distinct products
      // to prevent runaway pg_trgm queries.
      const distinctProducts = new Set(cartResult.items.map((i) => i.id));
      if (distinctProducts.size > 100) {
        throw Object.assign(
          new Error('El carrito excede el límite de 100 productos distintos para comparar'),
          { statusCode: 400 },
        );
      }

      const source: SourceRow[] = cartResult.items.map((i) => ({
        item_id: i.cart_item_id,
        product_id: i.id,
        quantity: i.quantity,
      }));

      const compareItems = await compareRepo.buildCompareItemsFromSource(source);
      return buildCompareResult(compareItems);
    },
  };
}
