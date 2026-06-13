/**
 * interests.repo.test.ts — Integration tests for makeInterestsRepo (Postgres + Prisma).
 * Uses withRollback() for per-test isolation.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testPrisma } from '../../../test/helpers/test-client.js';
import { withRollback } from '../../../test/helpers/with-rollback.js';
import { makeInterestsRepo } from './interests.repo.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedProduct(
  tx: Parameters<Parameters<typeof testPrisma.$transaction>[0]>[0],
  overrides: Partial<{ super_key: string; product_id: string; name: string }> = {},
): Promise<number> {
  const result = await tx.products.create({
    data: {
      super: overrides.super_key ?? 'vea',
      product_id: overrides.product_id ?? `pid-${Date.now()}-${Math.random()}`,
      name: overrides.name ?? 'Test Product',
      available: true,
      categories: [],
    },
  });
  return result.id;
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  await testPrisma.$queryRaw`SELECT 1`;
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('makeInterestsRepo', () => {
  describe('create → list → remove round-trip', () => {
    it('creates an interest, lists it, then removes it', async () => {
      await withRollback(async (tx) => {
        const productId = await seedProduct(tx);
        const repo = makeInterestsRepo(tx);

        // create
        const created = await repo.create(productId);
        expect(created.id).toBeTypeOf('number');
        expect(created.product_id).toBe(productId);
        expect(created.already).toBeUndefined();

        // list
        const interests = await repo.list();
        expect(interests).toHaveLength(1);
        const interest = interests[0];
        expect(interest).toBeDefined();
        expect(interest?.interest_id).toBe(created.id);
        expect(interest?.name).toBe('Test Product');
        expect(interest?.available).toBe(true);
        expect(Array.isArray(interest?.categories)).toBe(true);

        // remove
        const removed = await repo.remove(created.id);
        expect(removed.ok).toBe(true);

        // list again — should be empty
        expect(await repo.list()).toHaveLength(0);
      });
    });

    it('returns already:true when interest already exists', async () => {
      await withRollback(async (tx) => {
        const productId = await seedProduct(tx);
        const repo = makeInterestsRepo(tx);

        const first = await repo.create(productId);
        const second = await repo.create(productId);

        expect(second.already).toBe(true);
        expect(second.id).toBe(first.id);
      });
    });

    it('list returns interests ordered by added_at DESC', async () => {
      await withRollback(async (tx) => {
        const p1 = await seedProduct(tx, { product_id: 'p1' });
        const p2 = await seedProduct(tx, { product_id: 'p2' });

        // Insert with explicit timestamps
        await tx.interests.create({ data: { product_id: p1, added_at: new Date('2024-01-01') } });
        await tx.interests.create({ data: { product_id: p2, added_at: new Date('2024-01-02') } });

        const repo = makeInterestsRepo(tx);
        const list = await repo.list();
        expect(list).toHaveLength(2);
        // p2 was added later, should be first (DESC order)
        expect(list[0]?.product_id).toBe('p2');
        expect(list[1]?.product_id).toBe('p1');
      });
    });
  });

  describe('error cases', () => {
    it('throws 404 when creating interest for non-existent product', async () => {
      await withRollback(async (tx) => {
        const repo = makeInterestsRepo(tx);
        await expect(repo.create(99999)).rejects.toThrow('Producto no encontrado');
      });
    });

    it('throws 404 with statusCode when creating interest for non-existent product', async () => {
      await withRollback(async (tx) => {
        const repo = makeInterestsRepo(tx);
        try {
          await repo.create(99999);
          expect.fail('should have thrown');
        } catch (err) {
          const e = err as Error & { statusCode?: number };
          expect(e.statusCode).toBe(404);
        }
      });
    });

    it('throws 404 when removing non-existent interest', async () => {
      await withRollback(async (tx) => {
        const repo = makeInterestsRepo(tx);
        await expect(repo.remove(99999)).rejects.toThrow('No encontrado');
      });
    });

    it('throws 404 with statusCode when removing non-existent interest', async () => {
      await withRollback(async (tx) => {
        const repo = makeInterestsRepo(tx);
        try {
          await repo.remove(99999);
          expect.fail('should have thrown');
        } catch (err) {
          const e = err as Error & { statusCode?: number };
          expect(e.statusCode).toBe(404);
        }
      });
    });

    it('CASCADE: deleting a product removes its interest', async () => {
      await withRollback(async (tx) => {
        const productId = await seedProduct(tx);
        const repo = makeInterestsRepo(tx);

        const created = await repo.create(productId);
        expect(created.id).toBeTypeOf('number');

        // Delete the product — CASCADE should remove the interest
        await tx.products.delete({ where: { id: productId } });

        // Interest should be gone via CASCADE
        expect(await repo.list()).toHaveLength(0);

        // Attempting to create an interest for a now-deleted product fails
        await expect(repo.create(productId)).rejects.toThrow('Producto no encontrado');
      });
    });
  });

  describe('list returns parsed row shape', () => {
    it('categories is returned as array (jsonb)', async () => {
      await withRollback(async (tx) => {
        const productId = await seedProduct(tx);
        await tx.products.update({
          where: { id: productId },
          data: { categories: ['Lácteos', 'Yogur'] },
        });
        const repo = makeInterestsRepo(tx);
        await repo.create(productId);

        const [interest] = await repo.list();
        expect(interest?.categories).toEqual(['Lácteos', 'Yogur']);
      });
    });

    it('available is boolean true', async () => {
      await withRollback(async (tx) => {
        const productId = await seedProduct(tx);
        await tx.products.update({ where: { id: productId }, data: { available: false } });
        const repo = makeInterestsRepo(tx);
        await repo.create(productId);

        const [interest] = await repo.list();
        expect(interest?.available).toBe(false);
      });
    });
  });
});
