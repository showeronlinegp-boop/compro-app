/**
 * cross-user.isolation.test.ts — Cross-user data isolation GATE tests.
 *
 * Decision 2 hard requirement: user A MUST NOT be able to read, update, or
 * delete user B's cart / shopping / interests / profile rows. These tests are
 * the blocking gate before PR2 merges.
 *
 * Pattern: two real users (A and B) seeded in each withRollback. We verify
 * that the repo scoped to user A returns empty / 404 for data owned by user B.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testPrisma } from '../helpers/test-client.js';
import { withRollback } from '../helpers/with-rollback.js';
import { makeCartRepo } from '../../modules/cart/infrastructure/cart.repo.js';
import { makeInterestsRepo } from '../../modules/interests/infrastructure/interests.repo.js';
import { makeShoppingRepo } from '../../modules/shopping/infrastructure/shopping.repo.js';
import { makeProfileRepo } from '../../modules/profile/infrastructure/profile.repo.js';
import type { CompareRepo } from '../../modules/compare/infrastructure/compare.repo.js';
import type { TierMap } from '../../shared/types.js';

// Minimal compare stub
const stubCompareRepo: CompareRepo = {
  buildCompareItems: async () => [],
  buildCompareItemsFromSource: async () => [],
};

type Tx = Parameters<Parameters<typeof testPrisma.$transaction>[0]>[0];

async function seedUser(tx: Tx, label?: string): Promise<number> {
  const result = await tx.users.create({
    data: { clerk_user_id: `test_${label ?? ''}${Date.now()}_${Math.random()}` },
  });
  return result.id;
}

async function seedProduct(tx: Tx, overrides: Partial<{ product_id: string }> = {}): Promise<number> {
  const result = await tx.products.create({
    data: {
      super: 'vea',
      product_id: overrides.product_id ?? `pid-${Date.now()}-${Math.random()}`,
      name: 'Isolation Test Product',
      available: true,
      categories: [],
    },
  });
  return result.id;
}

beforeAll(async () => {
  await testPrisma.$queryRaw`SELECT 1`;
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

// ─── Cart isolation ────────────────────────────────────────────────────────────

describe('Cart isolation: user A cannot access user B cart items', () => {
  it('getOrCreate for user A does not return user B cart', async () => {
    await withRollback(async (tx) => {
      const userA = await seedUser(tx, 'a');
      const userB = await seedUser(tx, 'b');
      const productId = await seedProduct(tx);

      // User B adds an item
      const repoB = makeCartRepo(tx, stubCompareRepo, userB);
      await repoB.addItem(productId, 5);

      // User A's cart is empty
      const repoA = makeCartRepo(tx, stubCompareRepo, userA);
      const cartA = await repoA.getOrCreate();
      expect(cartA.items).toHaveLength(0);
      expect(cartA.item_count).toBe(0);
    });
  });

  it('user A updateQty on user B cart_item returns 404', async () => {
    await withRollback(async (tx) => {
      const userA = await seedUser(tx, 'a');
      const userB = await seedUser(tx, 'b');
      const productId = await seedProduct(tx);

      // User B adds an item
      const repoB = makeCartRepo(tx, stubCompareRepo, userB);
      const cartB = await repoB.addItem(productId, 3);
      const itemId = cartB.items[0]?.cart_item_id;
      expect(itemId).toBeDefined();
      if (!itemId) throw new Error('itemId missing');

      // User A tries to update user B's item
      const repoA = makeCartRepo(tx, stubCompareRepo, userA);
      await expect(repoA.updateQty(itemId, 99)).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  it('user A removeItem on user B cart_item returns 404', async () => {
    await withRollback(async (tx) => {
      const userA = await seedUser(tx, 'a');
      const userB = await seedUser(tx, 'b');
      const productId = await seedProduct(tx);

      // User B adds an item
      const repoB = makeCartRepo(tx, stubCompareRepo, userB);
      const cartB = await repoB.addItem(productId, 1);
      const itemId = cartB.items[0]?.cart_item_id;
      expect(itemId).toBeDefined();
      if (!itemId) throw new Error('itemId missing');

      // User A tries to delete user B's item
      const repoA = makeCartRepo(tx, stubCompareRepo, userA);
      await expect(repoA.removeItem(itemId)).rejects.toMatchObject({
        statusCode: 404,
      });

      // User B's item must still be there
      const cartBAfter = await repoB.getOrCreate();
      expect(cartBAfter.items).toHaveLength(1);
    });
  });
});

// ─── Shopping isolation ────────────────────────────────────────────────────────

describe('Shopping isolation: user A cannot access user B shopping items', () => {
  it('list for user A does not include user B items', async () => {
    await withRollback(async (tx) => {
      const userA = await seedUser(tx, 'a');
      const userB = await seedUser(tx, 'b');
      const productId = await seedProduct(tx);

      // User B creates a shopping item
      const repoB = makeShoppingRepo(tx, userB);
      await repoB.create({ product_id: productId });

      // User A sees nothing
      const repoA = makeShoppingRepo(tx, userA);
      const listA = await repoA.list();
      expect(listA).toHaveLength(0);
    });
  });

  it('user A update on user B shopping item returns 404', async () => {
    await withRollback(async (tx) => {
      const userA = await seedUser(tx, 'a');
      const userB = await seedUser(tx, 'b');
      const productId = await seedProduct(tx);

      // User B creates
      const repoB = makeShoppingRepo(tx, userB);
      const created = await repoB.create({ product_id: productId });

      // User A tries to update
      const repoA = makeShoppingRepo(tx, userA);
      await expect(repoA.update(created.id, { frequency_days: 99 })).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  it('user A remove on user B shopping item returns 404, item still exists', async () => {
    await withRollback(async (tx) => {
      const userA = await seedUser(tx, 'a');
      const userB = await seedUser(tx, 'b');
      const productId = await seedProduct(tx);

      // User B creates
      const repoB = makeShoppingRepo(tx, userB);
      const created = await repoB.create({ product_id: productId });

      // User A tries to remove
      const repoA = makeShoppingRepo(tx, userA);
      await expect(repoA.remove(created.id)).rejects.toMatchObject({
        statusCode: 404,
      });

      // User B's item still there
      const listB = await repoB.list();
      expect(listB).toHaveLength(1);
    });
  });

  it('two users can each have the same product in their shopping lists (no cross-user dedup)', async () => {
    await withRollback(async (tx) => {
      const userA = await seedUser(tx, 'a');
      const userB = await seedUser(tx, 'b');
      const productId = await seedProduct(tx);

      const repoA = makeShoppingRepo(tx, userA);
      const repoB = makeShoppingRepo(tx, userB);

      const createdA = await repoA.create({ product_id: productId });
      const createdB = await repoB.create({ product_id: productId });

      // Both succeed, different IDs
      expect(createdA.already).toBeUndefined();
      expect(createdB.already).toBeUndefined();
      expect(createdA.id).not.toBe(createdB.id);

      // Each sees only their own item
      expect(await repoA.list()).toHaveLength(1);
      expect(await repoB.list()).toHaveLength(1);
    });
  });
});

// ─── Interests isolation ───────────────────────────────────────────────────────

describe('Interests isolation: user A cannot access user B interests', () => {
  it('list for user A does not include user B interests', async () => {
    await withRollback(async (tx) => {
      const userA = await seedUser(tx, 'a');
      const userB = await seedUser(tx, 'b');
      const productId = await seedProduct(tx);

      // User B creates an interest
      const repoB = makeInterestsRepo(tx, userB);
      await repoB.create(productId);

      // User A sees nothing
      const repoA = makeInterestsRepo(tx, userA);
      const listA = await repoA.list();
      expect(listA).toHaveLength(0);
    });
  });

  it('user A remove on user B interest returns 404, interest still exists', async () => {
    await withRollback(async (tx) => {
      const userA = await seedUser(tx, 'a');
      const userB = await seedUser(tx, 'b');
      const productId = await seedProduct(tx);

      // User B creates
      const repoB = makeInterestsRepo(tx, userB);
      const created = await repoB.create(productId);

      // User A tries to remove
      const repoA = makeInterestsRepo(tx, userA);
      await expect(repoA.remove(created.id)).rejects.toMatchObject({
        statusCode: 404,
      });

      // User B's interest still there
      expect(await repoB.list()).toHaveLength(1);
    });
  });

  it('two users can each have the same product in interests (no cross-user dedup)', async () => {
    await withRollback(async (tx) => {
      const userA = await seedUser(tx, 'a');
      const userB = await seedUser(tx, 'b');
      const productId = await seedProduct(tx);

      const repoA = makeInterestsRepo(tx, userA);
      const repoB = makeInterestsRepo(tx, userB);

      const createdA = await repoA.create(productId);
      const createdB = await repoB.create(productId);

      expect(createdA.already).toBeUndefined();
      expect(createdB.already).toBeUndefined();
      expect(createdA.id).not.toBe(createdB.id);

      expect(await repoA.list()).toHaveLength(1);
      expect(await repoB.list()).toHaveLength(1);
    });
  });
});

// ─── Profile isolation ─────────────────────────────────────────────────────────

describe('Profile isolation: user A cannot read or overwrite user B profile', () => {
  const baseProfilePayload = {
    nombre: 'Test User',
    edad: 30,
    genero: 'm',
    hogar_tamano: 2,
    hogar_chicos: [] as string[],
    hogar_adultos_mayores: false,
    hogar_mascotas: [] as string[],
    tier_por_categoria: {} as TierMap,
    price_driven: [] as string[],
    perfil_hogar: 'pareja' as const,
    nse_proxy: null,
    onboarding_done: true,
  };

  it('user A get returns null when only user B has a profile', async () => {
    await withRollback(async (tx) => {
      const userA = await seedUser(tx, 'a');
      const userB = await seedUser(tx, 'b');

      // User B creates a profile
      const repoB = makeProfileRepo(tx, userB);
      await repoB.upsert(baseProfilePayload);

      // User A sees nothing
      const repoA = makeProfileRepo(tx, userA);
      const profileA = await repoA.get();
      expect(profileA).toBeNull();
    });
  });

  it('user A upsert does not overwrite user B profile', async () => {
    await withRollback(async (tx) => {
      const userA = await seedUser(tx, 'a');
      const userB = await seedUser(tx, 'b');

      const repoA = makeProfileRepo(tx, userA);
      const repoB = makeProfileRepo(tx, userB);

      await repoB.upsert({ ...baseProfilePayload, nombre: 'User B Name' });
      await repoA.upsert({ ...baseProfilePayload, nombre: 'User A Name' });

      // User B still sees their own name
      const profileB = await repoB.get();
      expect(profileB?.nombre).toBe('User B Name');

      // User A sees their own name
      const profileA = await repoA.get();
      expect(profileA?.nombre).toBe('User A Name');
    });
  });

  it('user A clear does not delete user B profile', async () => {
    await withRollback(async (tx) => {
      const userA = await seedUser(tx, 'a');
      const userB = await seedUser(tx, 'b');

      const repoA = makeProfileRepo(tx, userA);
      const repoB = makeProfileRepo(tx, userB);

      await repoA.upsert(baseProfilePayload);
      await repoB.upsert(baseProfilePayload);

      // User A clears their profile
      await repoA.clear();

      // User B's profile must still be there
      const profileB = await repoB.get();
      expect(profileB).not.toBeNull();

      // User A's profile is gone
      const profileA = await repoA.get();
      expect(profileA).toBeNull();
    });
  });
});
