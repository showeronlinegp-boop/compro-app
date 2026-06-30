/**
 * shopping.parity.test.ts — B7.2 Shopping parity tests.
 *
 * Tests spec scenarios for shopping repo:
 *   - Items due today (last_bought 7 days ago, frequency_days=7)
 *   - Items with null last_bought always included
 *   - Postgres interval date arithmetic parity with SQLite julianday semantics
 *
 * PR2: factory now requires userId — each test provisions a real users row.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testPrisma } from '../helpers/test-client.js';
import { withRollback } from '../helpers/with-rollback.js';
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

describe('Shopping parity: date arithmetic + null last_bought', () => {
  it('item with last_bought exactly frequency_days ago is due', async () => {
    await withRollback(async (tx) => {
      const userId = await seedUser(tx);
      const product = await tx.products.create({
        data: { super: 'vea', product_id: 'sp1', name: 'Milk', available: true, categories: [] },
      });
      const item = await tx.shopping.create({
        data: { product_id: product.id, frequency_days: 7, user_id: userId },
      });

      // Set last_bought to 7 days + 1 hour ago to ensure the condition
      // (NOW() - last_bought) >= frequency_days * INTERVAL '1 day' is true
      // even accounting for test execution time (~ms).
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      sevenDaysAgo.setHours(sevenDaysAgo.getHours() - 1); // extra buffer
      await tx.shopping.update({
        where: { id: item.id },
        data: { last_bought: sevenDaysAgo },
      });

      const repo = makeShoppingRepo(tx, userId);
      const weekly = await repo.listWeekly();
      const allItems = weekly.flatMap((g) => g.items);
      expect(allItems.map((i) => i.shopping_id)).toContain(item.id);
    });
  });

  it('item with null last_bought is always included', async () => {
    await withRollback(async (tx) => {
      const userId = await seedUser(tx);
      const product = await tx.products.create({
        data: { super: 'vea', product_id: 'sp2', name: 'Bread', available: true, categories: [] },
      });
      await tx.shopping.create({
        data: { product_id: product.id, frequency_days: 30, last_bought: null, user_id: userId },
      });

      const repo = makeShoppingRepo(tx, userId);
      const weekly = await repo.listWeekly();
      const allItems = weekly.flatMap((g) => g.items);
      expect(allItems.map((i) => i.product_id)).toContain('sp2');
    });
  });

  it('item bought recently (< frequency_days) is NOT included', async () => {
    await withRollback(async (tx) => {
      const userId = await seedUser(tx);
      const product = await tx.products.create({
        data: { super: 'vea', product_id: 'sp3', name: 'Cheese', available: true, categories: [] },
      });
      const item = await tx.shopping.create({
        data: { product_id: product.id, frequency_days: 14, user_id: userId },
      });

      // Set last_bought to 3 days ago (not due for another 11 days)
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      await tx.shopping.update({
        where: { id: item.id },
        data: { last_bought: threeDaysAgo },
      });

      const repo = makeShoppingRepo(tx, userId);
      const weekly = await repo.listWeekly();
      const allItems = weekly.flatMap((g) => g.items);
      expect(allItems.map((i) => i.product_id)).not.toContain('sp3');
    });
  });
});
