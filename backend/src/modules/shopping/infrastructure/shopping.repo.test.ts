/**
 * shopping.repo.test.ts — Integration tests for makeShoppingRepo (Postgres + Prisma).
 * Uses withRollback() for per-test isolation.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testPrisma } from '../../../test/helpers/test-client.js';
import { withRollback } from '../../../test/helpers/with-rollback.js';
import { makeShoppingRepo } from './shopping.repo.js';

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

describe('makeShoppingRepo', () => {
  describe('create → list → update → remove round-trip', () => {
    it('creates a shopping item, lists it, then removes it', async () => {
      await withRollback(async (tx) => {
        const productId = await seedProduct(tx);
        const repo = makeShoppingRepo(tx);

        // create
        const created = await repo.create({ product_id: productId });
        expect(created.id).toBeTypeOf('number');
        expect(created.product_id).toBe(productId);
        expect(created.already).toBeUndefined();
        expect(created.frequency_days).toBe(7);

        // list
        const items = await repo.list();
        expect(items).toHaveLength(1);
        const item = items[0];
        expect(item).toBeDefined();
        expect(item?.shopping_id).toBe(created.id);
        expect(item?.name).toBe('Test Product');
        expect(item?.available).toBe(true);
        expect(Array.isArray(item?.categories)).toBe(true);
        expect(item?.frequency_days).toBe(7);

        // update frequency_days
        const updated = await repo.update(created.id, { frequency_days: 14 });
        expect(updated.ok).toBe(true);

        const afterUpdate = await repo.list();
        expect(afterUpdate[0]?.frequency_days).toBe(14);

        // remove
        const removed = await repo.remove(created.id);
        expect(removed.ok).toBe(true);

        // list again — should be empty
        expect(await repo.list()).toHaveLength(0);
      });
    });

    it('returns already:true when item already exists in shopping list', async () => {
      await withRollback(async (tx) => {
        const productId = await seedProduct(tx);
        const repo = makeShoppingRepo(tx);

        const first = await repo.create({ product_id: productId });
        const second = await repo.create({ product_id: productId });

        expect(second.already).toBe(true);
        expect(second.id).toBe(first.id);
      });
    });

    it('respects custom frequency_days and notes on create', async () => {
      await withRollback(async (tx) => {
        const productId = await seedProduct(tx);
        const repo = makeShoppingRepo(tx);

        const created = await repo.create({ product_id: productId, frequency_days: 30, notes: 'extra' });
        expect(created.frequency_days).toBe(30);

        const items = await repo.list();
        expect(items[0]?.notes).toBe('extra');
      });
    });

    it('update sets last_bought', async () => {
      await withRollback(async (tx) => {
        const productId = await seedProduct(tx);
        const repo = makeShoppingRepo(tx);
        const created = await repo.create({ product_id: productId });

        await repo.update(created.id, { last_bought: '2024-01-15' });

        const items = await repo.list();
        // last_bought is returned as YYYY-MM-DD string
        expect(items[0]?.last_bought).toBe('2024-01-15');
      });
    });
  });

  describe('listWeekly', () => {
    it('returns only due items (last_bought IS NULL counts as due)', async () => {
      await withRollback(async (tx) => {
        const p1 = await seedProduct(tx, { product_id: 'p1', name: 'Milk', super_key: 'vea' });
        const p2 = await seedProduct(tx, { product_id: 'p2', name: 'Bread', super_key: 'vea' });
        const repo = makeShoppingRepo(tx);

        // p1: last_bought = NULL → always due
        await repo.create({ product_id: p1, frequency_days: 7 });

        // p2: last_bought far in past → due
        const created2 = await repo.create({ product_id: p2, frequency_days: 3 });
        await repo.update(created2.id, { last_bought: '2020-01-01' });

        const weekly = await repo.listWeekly();
        const allItems = weekly.flatMap((g) => g.items);
        const ids = allItems.map((i) => i.product_id);
        expect(ids).toContain('p1');
        expect(ids).toContain('p2');
      });
    });

    it('excludes items bought recently (not yet due)', async () => {
      await withRollback(async (tx) => {
        const p1 = await seedProduct(tx, { product_id: 'pRecent', name: 'Fresh', super_key: 'vea' });
        const repo = makeShoppingRepo(tx);

        const created = await repo.create({ product_id: p1, frequency_days: 365 });
        // Set last_bought to today (not due for another year)
        const today = new Date().toISOString().slice(0, 10);
        await repo.update(created.id, { last_bought: today });

        const weekly = await repo.listWeekly();
        const allItems = weekly.flatMap((g) => g.items);
        expect(allItems.map((i) => i.product_id)).not.toContain('pRecent');
      });
    });

    it('groups results by super and sums price', async () => {
      await withRollback(async (tx) => {
        const pVea = await seedProduct(tx, { product_id: 'pv1', super_key: 'vea' });
        const pCarre = await seedProduct(tx, { product_id: 'pc1', super_key: 'carrefour' });
        await tx.products.update({ where: { id: pVea }, data: { raw_price: 100 } });
        await tx.products.update({ where: { id: pCarre }, data: { raw_price: 200 } });

        const repo = makeShoppingRepo(tx);
        await repo.create({ product_id: pVea });
        await repo.create({ product_id: pCarre });

        const weekly = await repo.listWeekly();
        expect(weekly.length).toBe(2);

        const veaGroup = weekly.find((g) => g.super === 'vea');
        const carreGroup = weekly.find((g) => g.super === 'carrefour');
        expect(veaGroup?.items).toHaveLength(1);
        expect(veaGroup?.total).toBe(100);
        expect(carreGroup?.items).toHaveLength(1);
        expect(carreGroup?.total).toBe(200);
      });
    });
  });

  describe('error cases', () => {
    it('throws 404 when creating for non-existent product', async () => {
      await withRollback(async (tx) => {
        const repo = makeShoppingRepo(tx);
        await expect(repo.create({ product_id: 99999 })).rejects.toThrow('Producto no encontrado');
      });
    });

    it('throws 404 when updating non-existent item', async () => {
      await withRollback(async (tx) => {
        const repo = makeShoppingRepo(tx);
        await expect(repo.update(99999, { frequency_days: 7 })).rejects.toThrow('No encontrado');
      });
    });

    it('throws 400 when updating with no fields', async () => {
      await withRollback(async (tx) => {
        const productId = await seedProduct(tx);
        const repo = makeShoppingRepo(tx);
        const created = await repo.create({ product_id: productId });
        await expect(repo.update(created.id, {})).rejects.toThrow('Nada que actualizar');
      });
    });

    it('throws 404 when removing non-existent item', async () => {
      await withRollback(async (tx) => {
        const repo = makeShoppingRepo(tx);
        await expect(repo.remove(99999)).rejects.toThrow('No encontrado');
      });
    });
  });

  describe('parsed row shape', () => {
    it('categories is returned as parsed array (jsonb)', async () => {
      await withRollback(async (tx) => {
        const productId = await seedProduct(tx);
        await tx.products.update({
          where: { id: productId },
          data: { categories: ['Lácteos', 'Yogur'] },
        });
        const repo = makeShoppingRepo(tx);
        await repo.create({ product_id: productId });

        const [item] = await repo.list();
        expect(item?.categories).toEqual(['Lácteos', 'Yogur']);
      });
    });

    it('available is boolean', async () => {
      await withRollback(async (tx) => {
        const productId = await seedProduct(tx);
        await tx.products.update({ where: { id: productId }, data: { available: false } });
        const repo = makeShoppingRepo(tx);
        await repo.create({ product_id: productId });

        const [item] = await repo.list();
        expect(item?.available).toBe(false);
      });
    });
  });
});
