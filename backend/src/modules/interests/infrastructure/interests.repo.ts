import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { Interest, ProductRow, Promotion } from '../../../shared/types.js';

// ─── Row type from the JOIN query ─────────────────────────────────────────────

interface InterestRow extends ProductRow {
  interest_id: number;
  added_at: string | Date;
}

// ─── Row parser (mirrors interests.js parseRow) ───────────────────────────────

function tryParse<T>(v: unknown[] | string | null | undefined): T[] {
  if (v === null || v === undefined) return [];
  if (Array.isArray(v)) return v as T[];
  try {
    return JSON.parse(v as string) as T[];
  } catch {
    return [];
  }
}

function parseRow(p: InterestRow): Interest {
  const { interest_id, added_at, ...rest } = p;
  return {
    interest_id: Number(interest_id),
    added_at: added_at instanceof Date ? added_at.toISOString() : (added_at as string),
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

export interface InterestsRepo {
  list(): Promise<Interest[]>;
  create(product_id: number): Promise<{ id: number; product_id: number; already?: boolean }>;
  remove(id: number): Promise<{ ok: boolean }>;
}

// Accept PrismaClient or TransactionClient
type PrismaLike = Pick<PrismaClient, '$queryRaw'> & {
  interests: PrismaClient['interests'];
  products: PrismaClient['products'];
};

export function makeInterestsRepo(prisma: PrismaLike): InterestsRepo {
  return {
    async list() {
      const rows = await (prisma as PrismaClient).$queryRaw<InterestRow[]>(Prisma.sql`
        SELECT i.id as interest_id, i.added_at, p.*
        FROM interests i
        JOIN products p ON i.product_id = p.id
        ORDER BY i.added_at DESC
      `);
      return rows.map(parseRow);
    },

    async create(product_id) {
      // Check product exists
      const product = await prisma.products.findUnique({ where: { id: product_id } });
      if (!product) {
        throw Object.assign(new Error('Producto no encontrado'), { statusCode: 404 });
      }

      // Check for existing interest
      const existing = await prisma.interests.findFirst({ where: { product_id } });
      if (existing) {
        return { id: existing.id, product_id, already: true };
      }

      const created = await prisma.interests.create({ data: { product_id } });
      return { id: created.id, product_id };
    },

    async remove(id) {
      const existing = await prisma.interests.findUnique({ where: { id } });
      if (!existing) {
        throw Object.assign(new Error('No encontrado'), { statusCode: 404 });
      }
      await prisma.interests.delete({ where: { id } });
      return { ok: true };
    },
  };
}
