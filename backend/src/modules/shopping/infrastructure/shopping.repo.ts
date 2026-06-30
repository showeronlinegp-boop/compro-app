import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { ProductRow, Promotion, ShoppingItem, ShoppingRecommendation } from '../../../shared/types.js';

// ─── Row types from JOIN queries ──────────────────────────────────────────────

interface ShoppingRow extends ProductRow {
  shopping_id: number;
  frequency_days: number;
  last_bought: string | Date | null;
  notes: string | null;
  shopping_created_at: string | Date;
}

interface RecommendationRow extends ShoppingRow {
  days_until_due: number | bigint;
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

function parseRow(p: ShoppingRow): ShoppingItem {
  const { shopping_id, frequency_days, last_bought, notes, shopping_created_at, ...rest } = p;

  // last_bought: keep as ISO string or null (API contract)
  let last_bought_str: string | null = null;
  if (last_bought instanceof Date) {
    last_bought_str = last_bought.toISOString().slice(0, 10);
  } else if (typeof last_bought === 'string') {
    last_bought_str = last_bought;
  }

  return {
    shopping_id: Number(shopping_id),
    frequency_days: Number(frequency_days),
    last_bought: last_bought_str,
    notes,
    shopping_created_at:
      shopping_created_at instanceof Date
        ? shopping_created_at.toISOString()
        : (shopping_created_at as string),
    ...rest,
    categories: tryParse<string>(rest.categories as unknown[] | string | null),
    promotions: tryParse<Promotion>(rest.promotions as unknown[] | string | null),
    available: Boolean(rest.available),
    synced_at:
      rest.synced_at instanceof Date
        ? rest.synced_at.toISOString()
        : (rest.synced_at as string),
  };
}

// ─── Repo interface ───────────────────────────────────────────────────────────

export interface WeeklyGroup {
  super: string;
  items: ShoppingItem[];
  total: number;
}

export interface ShoppingRepo {
  list(): Promise<ShoppingItem[]>;
  listWeekly(): Promise<WeeklyGroup[]>;
  listRecommendations(): Promise<ShoppingRecommendation[]>;
  create(data: {
    product_id: number;
    frequency_days?: number;
    notes?: string;
  }): Promise<{ id: number; product_id: number; frequency_days: number; already?: boolean }>;
  update(
    id: number,
    data: { frequency_days?: number; last_bought?: string | null; notes?: string; product_id?: number },
  ): Promise<{ ok: boolean }>;
  remove(id: number): Promise<{ ok: boolean }>;
}

// Accept PrismaClient or TransactionClient
type PrismaLike = Pick<PrismaClient, '$queryRaw' | '$executeRaw'> & {
  shopping: PrismaClient['shopping'];
  products: PrismaClient['products'];
};

export function makeShoppingRepo(prisma: PrismaLike, userId: number): ShoppingRepo {
  return {
    async list() {
      const rows = await (prisma as PrismaClient).$queryRaw<ShoppingRow[]>(Prisma.sql`
        SELECT s.id as shopping_id, s.frequency_days, s.last_bought, s.notes,
               s.created_at as shopping_created_at,
               p.*
        FROM shopping s
        JOIN products p ON s.product_id = p.id
        WHERE s.user_id = ${userId}
        ORDER BY p.name
      `);
      return rows.map(parseRow);
    },

    async listWeekly() {
      // Postgres interval date math replaces SQLite julianday arithmetic.
      // NULL last_bought is treated as overdue (always returned).
      const rows = await (prisma as PrismaClient).$queryRaw<ShoppingRow[]>(Prisma.sql`
        SELECT s.id as shopping_id, s.frequency_days, s.last_bought, s.notes,
               s.created_at as shopping_created_at,
               p.*
        FROM shopping s
        JOIN products p ON s.product_id = p.id
        WHERE s.user_id = ${userId}
          AND (s.last_bought IS NULL
           OR (NOW() - s.last_bought) >= (s.frequency_days * INTERVAL '1 day'))
        ORDER BY p.super, p.name
      `);

      const itemList = rows.map(parseRow);
      const bySuper = new Map<string, WeeklyGroup>();

      for (const item of itemList) {
        const superKey = item.super;
        if (!bySuper.has(superKey)) {
          bySuper.set(superKey, { super: superKey, items: [], total: 0 });
        }
        const group = bySuper.get(superKey);
        if (group) {
          group.items.push(item);
          const price = item.offer_price ?? item.raw_price ?? 0;
          group.total += price;
        }
      }

      return Array.from(bySuper.values());
    },

    async listRecommendations() {
      const rows = await (prisma as PrismaClient).$queryRaw<RecommendationRow[]>(Prisma.sql`
        SELECT s.id as shopping_id, s.frequency_days, s.last_bought, s.notes,
               s.created_at as shopping_created_at,
               p.*,
               EXTRACT(epoch FROM (
                 (s.last_bought + (s.frequency_days * INTERVAL '1 day')) - NOW()
               )) / 86400.0 AS days_until_due
        FROM shopping s
        JOIN products p ON s.product_id = p.id
        WHERE s.user_id = ${userId}
          AND s.last_bought IS NOT NULL
          AND (s.last_bought + (s.frequency_days * INTERVAL '1 day')) - NOW() <= INTERVAL '5 days'
          AND (s.last_bought + (s.frequency_days * INTERVAL '1 day')) > NOW()
          AND p.discount_pct > 0
        ORDER BY days_until_due ASC
      `);

      return rows.map((r): ShoppingRecommendation => ({
        ...parseRow(r),
        days_until_due: Number(r.days_until_due),
        reason: 'advance_buy',
      }));
    },

    async create({ product_id, frequency_days = 7, notes = '' }) {
      const product = await prisma.products.findUnique({ where: { id: product_id } });
      if (!product) {
        throw Object.assign(new Error('Producto no encontrado'), { statusCode: 404 });
      }

      // Dedup is per-user: user A and user B can each have the same product.
      const existing = await prisma.shopping.findFirst({ where: { product_id, user_id: userId } });
      if (existing) {
        return { id: existing.id, product_id, frequency_days, already: true };
      }

      const created = await prisma.shopping.create({
        data: { product_id, frequency_days, notes, user_id: userId },
      });
      return { id: created.id, product_id, frequency_days };
    },

    async update(id, data) {
      // Ownership check: user may only update their own shopping items.
      const item = await prisma.shopping.findFirst({ where: { id, user_id: userId } });
      if (!item) {
        throw Object.assign(new Error('No encontrado'), { statusCode: 404 });
      }

      const updateData: {
        frequency_days?: number;
        last_bought?: Date | null;
        notes?: string;
        product_id?: number;
      } = {};

      if (data.frequency_days != null) {
        updateData.frequency_days = data.frequency_days;
      }
      if (data.last_bought !== undefined) {
        // Accept ISO date string (YYYY-MM-DD) or null
        updateData.last_bought =
          data.last_bought !== null ? new Date(data.last_bought) : null;
      }
      if (data.notes !== undefined) {
        updateData.notes = data.notes;
      }
      if (data.product_id != null) {
        const product = await prisma.products.findUnique({ where: { id: data.product_id } });
        if (!product) {
          throw Object.assign(new Error('Producto no encontrado'), { statusCode: 404 });
        }
        updateData.product_id = data.product_id;
      }

      if (Object.keys(updateData).length === 0) {
        throw Object.assign(new Error('Nada que actualizar'), { statusCode: 400 });
      }

      await prisma.shopping.update({ where: { id }, data: updateData });
      return { ok: true };
    },

    async remove(id) {
      // Ownership check: user may only remove their own shopping items.
      const item = await prisma.shopping.findFirst({ where: { id, user_id: userId } });
      if (!item) {
        throw Object.assign(new Error('No encontrado'), { statusCode: 404 });
      }
      await prisma.shopping.delete({ where: { id } });
      return { ok: true };
    },
  };
}
