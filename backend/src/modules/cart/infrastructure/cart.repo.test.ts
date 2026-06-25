/**
 * cart.repo.test.ts — Integration tests for makeCartRepo (Postgres + Prisma).
 * Uses withRollback() for per-test isolation, mirroring shopping.repo.test.ts.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testPrisma } from '../../../test/helpers/test-client.js';
import { withRollback } from '../../../test/helpers/with-rollback.js';
import { makeCartRepo } from './cart.repo.js';

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

describe('makeCartRepo', () => {
  describe('getOrCreate', () => {
    it('returns an empty CartResult with a cart_id', async () => {
      await withRollback(async (tx) => {
        const repo = makeCartRepo(tx);
        const result = await repo.getOrCreate();

        expect(result.cart_id).toBeTypeOf('number');
        expect(result.cart_id).toBeGreaterThan(0);
        expect(result.items).toEqual([]);
        expect(result.item_count).toBe(0);
      });
    });

    it('returns the same cart_id on repeated calls (get-or-create semantics)', async () => {
      await withRollback(async (tx) => {
        const repo = makeCartRepo(tx);
        const first = await repo.getOrCreate();
        const second = await repo.getOrCreate();

        expect(second.cart_id).toBe(first.cart_id);
      });
    });
  });

  describe('addItem', () => {
    it('inserts a new item and returns updated CartResult', async () => {
      await withRollback(async (tx) => {
        const productId = await seedProduct(tx);
        const repo = makeCartRepo(tx);
        await repo.getOrCreate();

        const result = await repo.addItem(productId, 1);

        expect(result.items).toHaveLength(1);
        expect(result.items[0]?.cart_item_id).toBeTypeOf('number');
        expect(result.items[0]?.quantity).toBe(1);
        expect(result.item_count).toBe(1);
      });
    });

    it('upserts: adding the same product_id a second time increments quantity', async () => {
      await withRollback(async (tx) => {
        const productId = await seedProduct(tx);
        const repo = makeCartRepo(tx);
        await repo.getOrCreate();

        await repo.addItem(productId, 1);
        const result = await repo.addItem(productId, 1);

        expect(result.items).toHaveLength(1);
        expect(result.items[0]?.quantity).toBe(2);
        expect(result.item_count).toBe(2);
      });
    });

    it('throws 404 when product_id does not exist', async () => {
      await withRollback(async (tx) => {
        const repo = makeCartRepo(tx);
        await expect(repo.addItem(99999, 1)).rejects.toThrow('Producto no encontrado');

        try {
          await repo.addItem(99999, 1);
        } catch (err) {
          expect((err as Error & { statusCode?: number }).statusCode).toBe(404);
        }
      });
    });
  });

  describe('updateQty', () => {
    it('changes quantity and returns updated CartResult', async () => {
      await withRollback(async (tx) => {
        const productId = await seedProduct(tx);
        const repo = makeCartRepo(tx);
        await repo.getOrCreate();

        const added = await repo.addItem(productId, 1);
        const itemId = added.items[0]?.cart_item_id;
        expect(itemId).toBeDefined();
        if (!itemId) throw new Error('cart_item_id missing');

        const updated = await repo.updateQty(itemId, 5);
        expect(updated.items[0]?.quantity).toBe(5);
        expect(updated.item_count).toBe(5);
      });
    });

    it('throws 400 when quantity < 1', async () => {
      await withRollback(async (tx) => {
        const productId = await seedProduct(tx);
        const repo = makeCartRepo(tx);
        await repo.getOrCreate();

        const added = await repo.addItem(productId, 1);
        const itemId = added.items[0]?.cart_item_id;
        expect(itemId).toBeDefined();
        if (!itemId) throw new Error('cart_item_id missing');

        await expect(repo.updateQty(itemId, 0)).rejects.toThrow('La cantidad debe ser al menos 1');

        try {
          await repo.updateQty(itemId, 0);
        } catch (err) {
          expect((err as Error & { statusCode?: number }).statusCode).toBe(400);
        }
      });
    });

    it('throws 404 when cart_item_id does not exist', async () => {
      await withRollback(async (tx) => {
        const repo = makeCartRepo(tx);
        await expect(repo.updateQty(99999, 1)).rejects.toThrow('Item no encontrado');

        try {
          await repo.updateQty(99999, 1);
        } catch (err) {
          expect((err as Error & { statusCode?: number }).statusCode).toBe(404);
        }
      });
    });
  });

  describe('removeItem', () => {
    it('removes one item and CartResult reflects the removal', async () => {
      await withRollback(async (tx) => {
        const p1 = await seedProduct(tx, { product_id: 'r1' });
        const p2 = await seedProduct(tx, { product_id: 'r2' });
        const repo = makeCartRepo(tx);
        await repo.getOrCreate();

        await repo.addItem(p1, 1);
        const after2 = await repo.addItem(p2, 1);
        expect(after2.items).toHaveLength(2);

        // Find item by the product's numeric id
        const p1Item = after2.items.find((i) => i.id === p1);
        expect(p1Item).toBeDefined();
        if (!p1Item) throw new Error('p1Item missing');

        const removed = await repo.removeItem(p1Item.cart_item_id);
        expect(removed.items).toHaveLength(1);
        expect(removed.items[0]?.id).toBe(p2);
        expect(removed.item_count).toBe(1);
      });
    });

    it('throws 404 when cart_item_id does not exist', async () => {
      await withRollback(async (tx) => {
        const repo = makeCartRepo(tx);
        await expect(repo.removeItem(99999)).rejects.toThrow('Item no encontrado');

        try {
          await repo.removeItem(99999);
        } catch (err) {
          expect((err as Error & { statusCode?: number }).statusCode).toBe(404);
        }
      });
    });
  });

  describe('clear', () => {
    it('removes all items; the cart row persists and item_count is 0', async () => {
      await withRollback(async (tx) => {
        const p1 = await seedProduct(tx, { product_id: 'c1' });
        const p2 = await seedProduct(tx, { product_id: 'c2' });
        const repo = makeCartRepo(tx);
        await repo.getOrCreate();

        await repo.addItem(p1, 2);
        await repo.addItem(p2, 3);

        const cleared = await repo.clear();
        expect(cleared.items).toEqual([]);
        expect(cleared.item_count).toBe(0);
        // Cart itself persists (cart_id is still valid)
        expect(cleared.cart_id).toBeTypeOf('number');
        expect(cleared.cart_id).toBeGreaterThan(0);
      });
    });
  });

  describe('item_count', () => {
    it('equals the sum of all item quantities', async () => {
      await withRollback(async (tx) => {
        const p1 = await seedProduct(tx, { product_id: 'q1' });
        const p2 = await seedProduct(tx, { product_id: 'q2' });
        const p3 = await seedProduct(tx, { product_id: 'q3' });
        const repo = makeCartRepo(tx);
        await repo.getOrCreate();

        await repo.addItem(p1, 3);
        await repo.addItem(p2, 2);
        const result = await repo.addItem(p3, 5);

        expect(result.item_count).toBe(10); // 3 + 2 + 5
      });
    });
  });

  describe('CartItemEntry shape', () => {
    it('includes full Product fields and cart-specific fields', async () => {
      await withRollback(async (tx) => {
        const productId = await seedProduct(tx, { name: 'Leche Entera' });
        const repo = makeCartRepo(tx);
        await repo.getOrCreate();

        const result = await repo.addItem(productId, 2);
        const item = result.items[0];

        expect(item).toBeDefined();
        if (!item) throw new Error('item missing');
        expect(item.cart_item_id).toBeTypeOf('number');
        expect(item.quantity).toBe(2);
        expect(item.added_at).toBeTypeOf('string');
        expect(item.name).toBe('Leche Entera');
        expect(item.available).toBe(true);
        expect(Array.isArray(item.categories)).toBe(true);
      });
    });
  });
});
