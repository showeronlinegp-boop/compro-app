/**
 * serialization.parity.test.ts — B7.6 Serialization parity tests.
 *
 * Verifies that parseRow correctly handles Postgres-native types:
 *   - available: boolean (not 0/1)
 *   - categories/promotions: jsonb array (not JSON string)
 *   - synced_at: Date → ISO string
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testPrisma } from '../helpers/test-client.js';
import { withRollback } from '../helpers/with-rollback.js';
import { makeCatalogRepo } from '../../modules/catalog/infrastructure/catalog.repo.js';

beforeAll(async () => {
  await testPrisma.$queryRaw`SELECT 1`;
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe('Serialization parity: Postgres types → API Product shape', () => {
  it('available is boolean true (not 1)', async () => {
    await withRollback(async (tx) => {
      await tx.products.create({
        data: {
          super: 'vea',
          product_id: 'ser1',
          name: 'Test Available',
          available: true,
          categories: [],
        },
      });
      const repo = makeCatalogRepo(tx);
      const result = await repo.search({});
      expect(result.data[0]?.available).toBe(true);
      expect(typeof result.data[0]?.available).toBe('boolean');
    });
  });

  it('available is boolean false (not 0)', async () => {
    await withRollback(async (tx) => {
      await tx.products.create({
        data: {
          super: 'vea',
          product_id: 'ser2',
          name: 'Test Unavailable',
          available: false,
          categories: [],
        },
      });
      const repo = makeCatalogRepo(tx);
      // No filter — returns all including unavailable
      const result = await repo.search({});
      expect(result.data[0]?.available).toBe(false);
    });
  });

  it('categories returned as string[] (jsonb array → string[])', async () => {
    await withRollback(async (tx) => {
      await tx.products.create({
        data: {
          super: 'vea',
          product_id: 'ser3',
          name: 'Test Categories',
          available: true,
          categories: ['Bebidas', 'Gaseosas'],
        },
      });
      const repo = makeCatalogRepo(tx);
      const result = await repo.search({});
      expect(result.data[0]?.categories).toEqual(['Bebidas', 'Gaseosas']);
    });
  });

  it('null categories returns empty array', async () => {
    await withRollback(async (tx) => {
      await tx.products.create({
        data: {
          super: 'vea',
          product_id: 'ser4',
          name: 'Test NullCat',
          available: true,
          // categories omitted → defaults to [] in schema
        },
      });
      const repo = makeCatalogRepo(tx);
      const result = await repo.search({});
      expect(Array.isArray(result.data[0]?.categories)).toBe(true);
    });
  });

  it('synced_at is returned as ISO string', async () => {
    await withRollback(async (tx) => {
      await tx.products.create({
        data: {
          super: 'vea',
          product_id: 'ser5',
          name: 'Test SyncedAt',
          available: true,
          categories: [],
        },
      });
      const repo = makeCatalogRepo(tx);
      const result = await repo.search({});
      const synced = result.data[0]?.synced_at;
      expect(typeof synced).toBe('string');
      // Should parse as a valid Date
      expect(isNaN(new Date(synced as string).getTime())).toBe(false);
    });
  });

  it('promotions is returned as Promotion[] (jsonb array)', async () => {
    await withRollback(async (tx) => {
      const promos = [{ label: '2do al 80%', type: 'nth_unit', min_qty: 2, discount_pct: 80 }];
      await tx.products.create({
        data: {
          super: 'vea',
          product_id: 'ser6',
          name: 'Test Promos',
          available: true,
          categories: [],
          promotions: promos,
        },
      });
      const repo = makeCatalogRepo(tx);
      const result = await repo.search({});
      expect(Array.isArray(result.data[0]?.promotions)).toBe(true);
      expect(result.data[0]?.promotions[0]).toMatchObject({ label: '2do al 80%' });
    });
  });
});
