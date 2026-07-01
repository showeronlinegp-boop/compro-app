/**
 * interests.cascade.test.ts — B7.5 Interests cascade delete test.
 *
 * Spec scenario: when a product is deleted, its interest and shopping rows
 * are also removed via FK CASCADE.
 *
 * PR2: repo factories now require userId — each test provisions a real users row.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testPrisma } from '../helpers/test-client.js';
import { withRollback } from '../helpers/with-rollback.js';
import { makeInterestsRepo } from '../../modules/interests/infrastructure/interests.repo.js';
import { makeShoppingRepo } from '../../modules/shopping/infrastructure/shopping.repo.js';

type Tx = Parameters<Parameters<typeof testPrisma.$transaction>[0]>[0];

async function seedUser(tx: Tx): Promise<number> {
  const result = await tx.users.create({
    data: { clerk_user_id: `test_${Date.now()}_${Math.random()}` },
  });
  return result.id;
}

beforeAll(async () => {
  await testPrisma.$queryRaw`SELECT 1`;
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe('Interests cascade delete', () => {
  it('deleting a product cascades to interests', async () => {
    await withRollback(async (tx) => {
      const userId = await seedUser(tx);
      const product = await tx.products.create({
        data: { super: 'vea', product_id: 'cas1', name: 'Cascade Product', available: true, categories: [] },
      });

      const repo = makeInterestsRepo(tx, userId);
      await repo.create(product.id);

      // Delete the product
      await tx.products.delete({ where: { id: product.id } });

      // Interest should be gone
      const interests = await repo.list();
      expect(interests).toHaveLength(0);
    });
  });

  it('deleting a product cascades to shopping rows', async () => {
    await withRollback(async (tx) => {
      const userId = await seedUser(tx);
      const product = await tx.products.create({
        data: { super: 'vea', product_id: 'cas2', name: 'Cascade Shopping', available: true, categories: [] },
      });

      const repo = makeShoppingRepo(tx, userId);
      await repo.create({ product_id: product.id });

      // Delete the product
      await tx.products.delete({ where: { id: product.id } });

      // Shopping item should be gone
      const items = await repo.list();
      expect(items).toHaveLength(0);
    });
  });

  it('interestsRepo.remove does NOT cascade to shopping', async () => {
    await withRollback(async (tx) => {
      const userId = await seedUser(tx);
      const product = await tx.products.create({
        data: { super: 'vea', product_id: 'cas3', name: 'No Cascade', available: true, categories: [] },
      });

      const interestsRepo = makeInterestsRepo(tx, userId);
      const shoppingRepo = makeShoppingRepo(tx, userId);

      const interest = await interestsRepo.create(product.id);
      await shoppingRepo.create({ product_id: product.id });

      // Delete interest by interest row ID (not by deleting the product)
      await interestsRepo.remove(interest.id);

      // Shopping should still be there
      const items = await shoppingRepo.list();
      expect(items).toHaveLength(1);
    });
  });
});
