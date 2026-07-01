/**
 * cart.repo.test.ts — Integration tests for makeCartRepo (Postgres + Prisma).
 * Uses withRollback() for per-test isolation, mirroring shopping.repo.test.ts.
 *
 * PR2: factory now requires userId — each test provisions a real users row.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testPrisma } from '../../../test/helpers/test-client.js';
import { withRollback } from '../../../test/helpers/with-rollback.js';
import type { CompareRepo } from '../../compare/infrastructure/compare.repo.js';
import { makeCartRepo } from './cart.repo.js';

// Minimal stub — existing tests don't exercise compareCart
const stubCompareRepo: CompareRepo = {
  buildCompareItems: async () => [],
  buildCompareItemsFromSource: async () => [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Tx = Parameters<Parameters<typeof testPrisma.$transaction>[0]>[0];

async function seedUser(tx: Tx): Promise<number> {
  const result = await tx.users.create({
    data: { clerk_user_id: `test_${Date.now()}_${Math.random()}` },
  });
  return result.id;
}

async function seedProduct(
  tx: Tx,
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
        const userId = await seedUser(tx);
        const repo = makeCartRepo(tx, stubCompareRepo, userId);
        const result = await repo.getOrCreate();

        expect(result.cart_id).toBeTypeOf('number');
        expect(result.cart_id).toBeGreaterThan(0);
        expect(result.items).toEqual([]);
        expect(result.item_count).toBe(0);
      });
    });

    it('returns the same cart_id on repeated calls (get-or-create semantics)', async () => {
      await withRollback(async (tx) => {
        const userId = await seedUser(tx);
        const repo = makeCartRepo(tx, stubCompareRepo, userId);
        const first = await repo.getOrCreate();
        const second = await repo.getOrCreate();

        expect(second.cart_id).toBe(first.cart_id);
      });
    });

    it('preserves pre-existing items on the second call', async () => {
      await withRollback(async (tx) => {
        const userId = await seedUser(tx);
        const productId = await seedProduct(tx);
        const repo = makeCartRepo(tx, stubCompareRepo, userId);

        await repo.getOrCreate();
        await repo.addItem(productId, 2);

        // Second getOrCreate must not wipe items
        const second = await repo.getOrCreate();
        expect(second.items).toHaveLength(1);
        expect(second.items[0]?.quantity).toBe(2);
      });
    });
  });

  describe('addItem', () => {
    it('creates the cart automatically when none exists, then adds the item', async () => {
      await withRollback(async (tx) => {
        const userId = await seedUser(tx);
        const productId = await seedProduct(tx);
        const repo = makeCartRepo(tx, stubCompareRepo, userId);

        // No getOrCreate call first — addItem must create the cart itself
        const result = await repo.addItem(productId, 1);

        expect(result.cart_id).toBeTypeOf('number');
        expect(result.cart_id).toBeGreaterThan(0);
        expect(result.items).toHaveLength(1);
        expect(result.items[0]?.quantity).toBe(1);
      });
    });

    it('honors the passed quantity on the create branch (not defaulting to 1)', async () => {
      await withRollback(async (tx) => {
        const userId = await seedUser(tx);
        const productId = await seedProduct(tx);
        const repo = makeCartRepo(tx, stubCompareRepo, userId);

        // No pre-existing cart
        const result = await repo.addItem(productId, 3);

        expect(result.items[0]?.quantity).toBe(3);
        expect(result.item_count).toBe(3);
      });
    });

    it('inserts a new item and returns updated CartResult', async () => {
      await withRollback(async (tx) => {
        const userId = await seedUser(tx);
        const productId = await seedProduct(tx);
        const repo = makeCartRepo(tx, stubCompareRepo, userId);
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
        const userId = await seedUser(tx);
        const productId = await seedProduct(tx);
        const repo = makeCartRepo(tx, stubCompareRepo, userId);
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
        const userId = await seedUser(tx);
        const repo = makeCartRepo(tx, stubCompareRepo, userId);
        await expect(repo.addItem(99999, 1)).rejects.toMatchObject({
          message: expect.stringContaining('Producto no encontrado'),
          statusCode: 404,
        });
      });
    });
  });

  describe('updateQty', () => {
    it('changes quantity and returns updated CartResult', async () => {
      await withRollback(async (tx) => {
        const userId = await seedUser(tx);
        const productId = await seedProduct(tx);
        const repo = makeCartRepo(tx, stubCompareRepo, userId);
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
        const userId = await seedUser(tx);
        const productId = await seedProduct(tx);
        const repo = makeCartRepo(tx, stubCompareRepo, userId);
        await repo.getOrCreate();

        const added = await repo.addItem(productId, 1);
        const itemId = added.items[0]?.cart_item_id;
        expect(itemId).toBeDefined();
        if (!itemId) throw new Error('cart_item_id missing');

        await expect(repo.updateQty(itemId, 0)).rejects.toMatchObject({
          message: expect.stringContaining('La cantidad debe ser al menos 1'),
          statusCode: 400,
        });
      });
    });

    it('throws 404 when cart_item_id does not exist', async () => {
      await withRollback(async (tx) => {
        const userId = await seedUser(tx);
        const repo = makeCartRepo(tx, stubCompareRepo, userId);
        await expect(repo.updateQty(99999, 1)).rejects.toMatchObject({
          message: expect.stringContaining('Item no encontrado'),
          statusCode: 404,
        });
      });
    });
  });

  describe('removeItem', () => {
    it('removes one item and CartResult reflects the removal', async () => {
      await withRollback(async (tx) => {
        const userId = await seedUser(tx);
        const p1 = await seedProduct(tx, { product_id: 'r1' });
        const p2 = await seedProduct(tx, { product_id: 'r2' });
        const repo = makeCartRepo(tx, stubCompareRepo, userId);
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
        const userId = await seedUser(tx);
        const repo = makeCartRepo(tx, stubCompareRepo, userId);
        await expect(repo.removeItem(99999)).rejects.toMatchObject({
          message: expect.stringContaining('Item no encontrado'),
          statusCode: 404,
        });
      });
    });
  });

  describe('clear', () => {
    it('removes all items; the cart row persists and item_count is 0', async () => {
      await withRollback(async (tx) => {
        const userId = await seedUser(tx);
        const p1 = await seedProduct(tx, { product_id: 'c1' });
        const p2 = await seedProduct(tx, { product_id: 'c2' });
        const repo = makeCartRepo(tx, stubCompareRepo, userId);
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
        const userId = await seedUser(tx);
        const p1 = await seedProduct(tx, { product_id: 'q1' });
        const p2 = await seedProduct(tx, { product_id: 'q2' });
        const p3 = await seedProduct(tx, { product_id: 'q3' });
        const repo = makeCartRepo(tx, stubCompareRepo, userId);
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
        const userId = await seedUser(tx);
        const productId = await seedProduct(tx, { name: 'Leche Entera' });
        const repo = makeCartRepo(tx, stubCompareRepo, userId);
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

  describe('compareCart', () => {
    it('empty cart → empty CompareResult (items=[], option_b.total=0)', async () => {
      await withRollback(async (tx) => {
        const userId = await seedUser(tx);
        const prismaLike = tx as unknown as Parameters<typeof makeCartRepo>[0];
        const { makeCompareRepo } = await import('../../compare/infrastructure/compare.repo.js');

        // Use a real compare repo so the full path is exercised
        const compareRepo = makeCompareRepo(
          prismaLike as unknown as Parameters<typeof makeCompareRepo>[0],
        );
        const repo = makeCartRepo(prismaLike, compareRepo, userId);

        // Ensure cart exists but has no items
        await repo.getOrCreate();

        const result = await repo.compareCart();

        expect(result.items).toEqual([]);
        expect(result.option_a).toEqual([]);
        expect(result.option_b.total).toBe(0);
        expect(result.option_b.by_super).toEqual([]);
        expect(result.option_b.breakdown).toEqual([]);
        expect(result.option_b.savings_vs_option_a).toBe(0);
      });
    });

    it('non-empty cart → result.items[0].home_price = unitPrice × qty, shopping_id = cart_item_id', async () => {
      await withRollback(async (tx) => {
        const userId = await seedUser(tx);
        const prismaLike = tx as unknown as Parameters<typeof makeCartRepo>[0];
        const { makeCompareRepo } = await import('../../compare/infrastructure/compare.repo.js');

        // Seed a priced product
        const unitPrice = 350;
        const productId = await tx.products
          .create({
            data: {
              super: 'vea',
              product_id: `cart-cmp-${Date.now()}`,
              name: 'Leche Descremada 1L',
              available: true,
              categories: [],
              raw_price: unitPrice,
              offer_price: null,
            },
          })
          .then((r) => r.id);

        const compareRepo = makeCompareRepo(
          prismaLike as unknown as Parameters<typeof makeCompareRepo>[0],
        );
        const repo = makeCartRepo(prismaLike, compareRepo, userId);

        // Add product with qty=2; capture the cart_item_id
        const cartResult = await repo.addItem(productId, 2);
        const cartItem = cartResult.items[0];
        expect(cartItem).toBeDefined();
        if (!cartItem) throw new Error('cartItem missing');
        const cartItemId = cartItem.cart_item_id;

        // compareCart exercises the real chain:
        // hydrateCart → SourceRow mapping (item_id=cart_item_id, product_id=i.id)
        // → buildCompareItemsFromSource → buildCompareResult
        const result = await repo.compareCart();

        expect(result.items).toHaveLength(1);
        const cmpItem = result.items[0];
        expect(cmpItem).toBeDefined();
        if (!cmpItem) throw new Error('cmpItem missing');

        // home_price must equal unitPrice × qty (proves qty multiplication end-to-end)
        expect(cmpItem.home_price).toBe(unitPrice * 2);

        // shopping_id must be cart_item_id, not the product PK
        // (proves i.cart_item_id mapping, not i.id)
        expect(cmpItem.shopping_id).toBe(cartItemId);
      });
    });
  });
});
