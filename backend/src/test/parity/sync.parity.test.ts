/**
 * sync.parity.test.ts — B7.4 Sync repo parity test.
 *
 * Tests that upsert does not duplicate a product (ON CONFLICT semantics preserved)
 * and that the chunked $transaction approach works correctly.
 *
 * Uses truncateAll() because upsertProducts opens its own $transaction.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testPrisma } from '../helpers/test-client.js';
import { truncateAll } from '../helpers/with-rollback.js';
import { makeSyncRepo } from '../../crawler/infrastructure/sync.repo.js';

beforeAll(async () => {
  await testPrisma.$queryRaw`SELECT 1`;
});

beforeEach(async () => {
  await truncateAll();
});

afterEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe('Sync parity: upsert + chunked transaction', () => {
  it('upsert does not duplicate a product (ON CONFLICT DO UPDATE)', async () => {
    const repo = makeSyncRepo(testPrisma);

    await repo.upsertProducts('disco', [
      {
        product_id: 'P001',
        sku_id: null,
        name: 'Original Name',
        barcode: null,
        image_url: null,
        product_url: 'https://disco.com/p001',
        raw_price: 100,
        offer_price: null,
        discount_pct: 0,
        available: true,
        category_paths: [],
        promotions: [],
      },
    ]);

    // Upsert same product_id with updated name
    await repo.upsertProducts('disco', [
      {
        product_id: 'P001',
        sku_id: null,
        name: 'Updated Name',
        barcode: null,
        image_url: null,
        product_url: 'https://disco.com/p001',
        raw_price: 110,
        offer_price: null,
        discount_pct: 0,
        available: true,
        category_paths: [],
        promotions: [],
      },
    ]);

    const products = await testPrisma.products.findMany({
      where: { super: 'disco', product_id: 'P001' },
    });

    expect(products).toHaveLength(1);
    expect(products[0]?.name).toBe('Updated Name');
    expect(products[0]?.raw_price).toBe(110);
  });

  it('upsert handles a batch of 2 products correctly', async () => {
    const repo = makeSyncRepo(testPrisma);

    await repo.upsertProducts('vea', [
      {
        product_id: 'A1',
        sku_id: null,
        name: 'Product A',
        barcode: null,
        image_url: null,
        product_url: 'https://vea.com/a1',
        raw_price: 50,
        offer_price: null,
        discount_pct: 0,
        available: true,
        category_paths: ['cat1'],
        promotions: [],
      },
      {
        product_id: 'B1',
        sku_id: null,
        name: 'Product B',
        barcode: null,
        image_url: null,
        product_url: 'https://vea.com/b1',
        raw_price: 75,
        offer_price: null,
        discount_pct: 0,
        available: false,
        category_paths: [],
        promotions: [],
      },
    ]);

    const products = await testPrisma.products.findMany({
      where: { super: 'vea' },
      orderBy: { product_id: 'asc' },
    });

    expect(products).toHaveLength(2);
    expect(products[0]?.product_id).toBe('A1');
    expect(products[0]?.available).toBe(true);
    expect(products[1]?.product_id).toBe('B1');
    expect(products[1]?.available).toBe(false);
  });

  it('categories are stored as jsonb and retrieved as array', async () => {
    const repo = makeSyncRepo(testPrisma);

    await repo.upsertProducts('carrefour', [
      {
        product_id: 'C1',
        sku_id: null,
        name: 'Categorized Product',
        barcode: '1234567890',
        image_url: null,
        product_url: 'https://carrefour.com/c1',
        raw_price: 200,
        offer_price: 150,
        discount_pct: 25,
        available: true,
        category_paths: ['Bebidas', 'Gaseosas'],
        promotions: [],
      },
    ]);

    const product = await testPrisma.products.findFirst({
      where: { super: 'carrefour', product_id: 'C1' },
    });

    expect(product?.categories).toEqual(['Bebidas', 'Gaseosas']);
    expect(product?.available).toBe(true);
    expect(product?.discount_pct).toBe(25);
  });
});
