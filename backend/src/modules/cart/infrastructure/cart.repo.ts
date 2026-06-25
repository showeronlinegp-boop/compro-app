import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { CartItemEntry, CartResult, ProductRow, Promotion } from '../../../shared/types.js';
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
}

// Accept PrismaClient or TransactionClient
type PrismaLike = Pick<PrismaClient, '$queryRaw' | '$executeRaw'> & {
  cart: PrismaClient['cart'];
  cart_items: PrismaClient['cart_items'];
  products: PrismaClient['products'];
};

// ─── Hydration helper ─────────────────────────────────────────────────────────

async function hydrateCart(prisma: PrismaLike, cart_id: number): Promise<CartResult> {
  const rows = await (prisma as PrismaClient).$queryRaw<CartItemRow[]>(Prisma.sql`
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

export function makeCartRepo(prisma: PrismaLike): CartRepo {
  return {
    async getOrCreate() {
      // Single-cart app: always resolve to id=1 (get-or-create).
      let cart = await prisma.cart.findFirst({ orderBy: { id: 'asc' } });
      if (!cart) {
        cart = await prisma.cart.create({ data: {} });
      }
      return hydrateCart(prisma, cart.id);
    },

    async addItem(product_id, quantity) {
      const product = await prisma.products.findUnique({ where: { id: product_id } });
      if (!product) {
        throw Object.assign(new Error('Producto no encontrado'), { statusCode: 404 });
      }

      clampQty(quantity);

      let cart = await prisma.cart.findFirst({ orderBy: { id: 'asc' } });
      if (!cart) {
        cart = await prisma.cart.create({ data: {} });
      }

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
      let cart = await prisma.cart.findFirst({ orderBy: { id: 'asc' } });
      if (!cart) {
        cart = await prisma.cart.create({ data: {} });
      }

      await prisma.cart_items.deleteMany({ where: { cart_id: cart.id } });

      return hydrateCart(prisma, cart.id);
    },
  };
}
