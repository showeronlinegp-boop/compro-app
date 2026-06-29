/**
 * catalog.repo.test.ts — Integration tests for makeCatalogRepo (Postgres + Prisma).
 *
 * Uses withRollback() for per-test isolation (transaction rolled back after each test).
 * Requires compro_test DB with Prisma schema applied (handled by global-setup.ts).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testPrisma } from '../../../test/helpers/test-client.js';
import { withRollback } from '../../../test/helpers/with-rollback.js';
import { makeCatalogRepo } from './catalog.repo.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface ProductSeed {
  super_key?: string;
  product_id?: string;
  name?: string;
  barcode?: string | null;
  categories?: unknown;
  available?: boolean;
  raw_price?: number | null;
  discount_pct?: number;
  offer_price?: number | null;
}

async function seedProduct(
  tx: Parameters<Parameters<typeof testPrisma.$transaction>[0]>[0],
  overrides: ProductSeed = {},
): Promise<number> {
  const result = await tx.products.create({
    data: {
      super: overrides.super_key ?? 'vea',
      product_id: overrides.product_id ?? `pid-${Date.now()}-${Math.random()}`,
      name: overrides.name ?? 'Test Product',
      barcode: overrides.barcode ?? null,
      categories: overrides.categories !== undefined ? (overrides.categories as object) : [],
      available: overrides.available ?? true,
      raw_price: overrides.raw_price ?? null,
      discount_pct: overrides.discount_pct ?? 0,
      offer_price: overrides.offer_price ?? null,
    },
  });
  return result.id;
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  // Verify test DB is reachable
  await testPrisma.$queryRaw`SELECT 1`;
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('makeCatalogRepo', () => {
  describe('search', () => {
    it('returns empty result set when no products', async () => {
      await withRollback(async (tx) => {
        const repo = makeCatalogRepo(tx);
        const result = await repo.search({});
        expect(result.data).toEqual([]);
        expect(result.total).toBe(0);
        expect(result.page).toBe(1);
        expect(result.pages).toBe(0);
      });
    });

    it('returns all products with no filters', async () => {
      await withRollback(async (tx) => {
        await seedProduct(tx, { name: 'Leche' });
        await seedProduct(tx, { name: 'Pan' });
        const repo = makeCatalogRepo(tx);
        const result = await repo.search({});
        expect(result.total).toBe(2);
        expect(result.data).toHaveLength(2);
      });
    });

    it('parseRow: available is boolean, categories is array', async () => {
      await withRollback(async (tx) => {
        await seedProduct(tx, {
          name: 'Yogur',
          available: true,
          categories: ['Lácteos', 'Yogur'],
        });
        const repo = makeCatalogRepo(tx);
        const result = await repo.search({});
        const item = result.data[0];
        expect(item?.available).toBe(true);
        expect(Array.isArray(item?.categories)).toBe(true);
        expect(item?.categories).toEqual(['Lácteos', 'Yogur']);
      });
    });

    it('filters by q (name LIKE, accent-insensitive)', async () => {
      await withRollback(async (tx) => {
        await seedProduct(tx, { name: 'Leche entera' });
        await seedProduct(tx, { name: 'Pan integral' });
        const repo = makeCatalogRepo(tx);
        const result = await repo.search({ q: 'leche' });
        expect(result.total).toBe(1);
        expect(result.data[0]?.name).toBe('Leche entera');
      });
    });

    it('q is punctuation-insensitive: "coca cola zero" matches "Coca-Cola Zero"', async () => {
      await withRollback(async (tx) => {
        await seedProduct(tx, { product_id: 'h1', name: 'Gaseosa Coca-Cola Zero 2,5 Lt.' });
        await seedProduct(tx, { product_id: 'h2', name: 'Pan integral' });
        const repo = makeCatalogRepo(tx);
        const result = await repo.search({ q: 'coca cola zero' });
        expect(result.total).toBe(1);
        expect(result.data[0]?.name).toBe('Gaseosa Coca-Cola Zero 2,5 Lt.');
      });
    });

    it('q is accent-insensitive and order-independent', async () => {
      await withRollback(async (tx) => {
        await seedProduct(tx, { product_id: 'a1', name: 'Café Molido La Virginia' });
        const repo = makeCatalogRepo(tx);
        expect((await repo.search({ q: 'cafe' })).total).toBe(1);
        expect((await repo.search({ q: 'virginia cafe' })).total).toBe(1);
      });
    });

    it('q with only punctuation yields no tokens → no name filter applied', async () => {
      await withRollback(async (tx) => {
        await seedProduct(tx, { product_id: 'p1', name: 'Leche' });
        await seedProduct(tx, { product_id: 'p2', name: 'Pan' });
        const repo = makeCatalogRepo(tx);
        // "-" normalizes to empty → buildNameSearch returns null → all rows returned
        expect((await repo.search({ q: '-' })).total).toBe(2);
      });
    });

    it('filters by super', async () => {
      await withRollback(async (tx) => {
        await seedProduct(tx, { super_key: 'vea', product_id: 'pv', name: 'VeaProduct' });
        await seedProduct(tx, {
          super_key: 'carrefour',
          product_id: 'pc',
          name: 'CarreProduct',
        });
        const repo = makeCatalogRepo(tx);
        const result = await repo.search({ super: 'vea' });
        expect(result.total).toBe(1);
        expect(result.data[0]?.super).toBe('vea');
      });
    });

    it('filters by category via vtexStrings', async () => {
      await withRollback(async (tx) => {
        await seedProduct(tx, { name: 'Leche', categories: ['Lácteos'] });
        await seedProduct(tx, { name: 'Pan', categories: ['Panaderia'] });
        const repo = makeCatalogRepo(tx);
        const result = await repo.search({ category: 'lacteos', vtexStrings: ['Lácteos'] });
        expect(result.total).toBe(1);
        expect(result.data[0]?.name).toBe('Leche');
      });
    });

    it('filters by discount=1', async () => {
      await withRollback(async (tx) => {
        await seedProduct(tx, { name: 'OnSale', discount_pct: 20 });
        await seedProduct(tx, { name: 'Normal', discount_pct: 0 });
        const repo = makeCatalogRepo(tx);
        const result = await repo.search({ discount: '1' });
        expect(result.total).toBe(1);
        expect(result.data[0]?.name).toBe('OnSale');
      });
    });

    it('filters by available=1', async () => {
      await withRollback(async (tx) => {
        await seedProduct(tx, { name: 'Available', available: true });
        await seedProduct(tx, { name: 'Unavailable', available: false });
        const repo = makeCatalogRepo(tx);
        const result = await repo.search({ available: '1' });
        expect(result.total).toBe(1);
        expect(result.data[0]?.name).toBe('Available');
      });
    });

    it('paginates correctly', async () => {
      await withRollback(async (tx) => {
        for (let i = 1; i <= 5; i++) {
          await seedProduct(tx, { product_id: `p${i}`, name: `Product ${i}` });
        }
        const repo = makeCatalogRepo(tx);
        const page1 = await repo.search({ limit: '2', page: '1' });
        const page2 = await repo.search({ limit: '2', page: '2' });
        expect(page1.data).toHaveLength(2);
        expect(page1.total).toBe(5);
        expect(page1.pages).toBe(3);
        expect(page2.data).toHaveLength(2);
        expect(page2.page).toBe(2);
      });
    });
  });

  describe('getGroups', () => {
    it('returns empty when no products', async () => {
      await withRollback(async (tx) => {
        const repo = makeCatalogRepo(tx);
        const result = await repo.getGroups({});
        expect(result.data).toEqual([]);
        expect(result.total).toBe(0);
      });
    });

    it('includes a barcode-less product as its own singleton group', async () => {
      await withRollback(async (tx) => {
        const id = await seedProduct(tx, { name: 'NoBarcodeProduct', barcode: null });
        const repo = makeCatalogRepo(tx);
        const result = await repo.getGroups({});
        expect(result.total).toBe(1);
        expect(result.data).toHaveLength(1);
        const group = result.data[0];
        expect(group?.key).toBe(`id:${id}`);
        expect(group?.barcode).toBeNull();
        expect(group?.super_count).toBe(1);
        expect(group?.variants).toHaveLength(1);
      });
    });

    it('deduplicates by barcode across supers, cheapest first', async () => {
      await withRollback(async (tx) => {
        await seedProduct(tx, {
          super_key: 'vea',
          product_id: 'v1',
          name: 'Leche Entera 1L',
          barcode: 'BC123',
          raw_price: 100,
          available: true,
        });
        await seedProduct(tx, {
          super_key: 'carrefour',
          product_id: 'c1',
          name: 'Leche Entera 1L',
          barcode: 'BC123',
          raw_price: 90,
          available: true,
        });
        const repo = makeCatalogRepo(tx);
        const result = await repo.getGroups({});
        expect(result.total).toBe(1);
        const group = result.data[0];
        expect(group?.key).toBe('BC123');
        expect(group?.barcode).toBe('BC123');
        expect(group?.super_count).toBe(2);
        expect(group?.variants).toHaveLength(2);
        expect(group?.variants[0]?.raw_price).toBe(90);
        expect(group?.variants[1]?.raw_price).toBe(100);
      });
    });

    it('INCLUDES barcodes present in only one super (as singletons)', async () => {
      await withRollback(async (tx) => {
        await seedProduct(tx, {
          super_key: 'vea',
          product_id: 'only1',
          name: 'Single Super Product',
          barcode: 'BC_SINGLE',
          available: true,
        });
        const repo = makeCatalogRepo(tx);
        const result = await repo.getGroups({});
        expect(result.total).toBe(1);
        expect(result.data[0]?.super_count).toBe(1);
        expect(result.data[0]?.variants).toHaveLength(1);
      });
    });

    it('finds a single-super hyphenated product by space-separated query (regression)', async () => {
      await withRollback(async (tx) => {
        await seedProduct(tx, {
          super_key: 'dia',
          product_id: 'dia25',
          name: 'Gaseosa Coca-Cola Zero 2,5 Lt.',
          barcode: '7790895068096',
          available: true,
        });
        const repo = makeCatalogRepo(tx);
        const result = await repo.getGroups({ q: 'coca cola zero' });
        expect(result.total).toBe(1);
        expect(result.data[0]?.barcode).toBe('7790895068096');
        expect(result.data[0]?.variants[0]?.super).toBe('dia');
      });
    });

    it('excludes unavailable rows from grouping but keeps available singleton', async () => {
      await withRollback(async (tx) => {
        await seedProduct(tx, {
          super_key: 'vea',
          product_id: 'va',
          barcode: 'BC_AVAIL',
          available: true,
        });
        await seedProduct(tx, {
          super_key: 'carrefour',
          product_id: 'ca',
          barcode: 'BC_AVAIL',
          available: false,
        });
        const repo = makeCatalogRepo(tx);
        const result = await repo.getGroups({});
        expect(result.total).toBe(1);
        expect(result.data[0]?.super_count).toBe(1);
        expect(result.data[0]?.variants).toHaveLength(1);
        expect(result.data[0]?.variants[0]?.super).toBe('vea');
      });
    });

    it('surfaces an out-of-stock VEA variant within a group kept alive by an in-stock competitor', async () => {
      await withRollback(async (tx) => {
        // Group exists because Carrefour has it in stock; VEA's row is out of stock
        // but must still appear as a variant (transparency) carrying available=false.
        await seedProduct(tx, {
          super_key: 'carrefour',
          product_id: 'cf',
          barcode: 'BC_OOS',
          raw_price: 2735,
          available: true,
        });
        await seedProduct(tx, {
          super_key: 'vea',
          product_id: 'vea-oos',
          barcode: 'BC_OOS',
          raw_price: 4107.19,
          available: false,
        });
        const repo = makeCatalogRepo(tx);
        const result = await repo.getGroups({});
        expect(result.total).toBe(1);
        // super_count is driven by in-stock rows only → 1.
        expect(result.data[0]?.super_count).toBe(1);
        // But both variants are returned, including the OOS VEA row.
        const variants = result.data[0]?.variants ?? [];
        expect(variants).toHaveLength(2);
        const vea = variants.find((v) => v.super === 'vea');
        expect(vea?.available).toBe(false);
        expect(vea?.raw_price).toBe(4107.19);
      });
    });

    it('comparable groups sort before singletons (super_count DESC)', async () => {
      await withRollback(async (tx) => {
        await seedProduct(tx, { super_key: 'vea', product_id: 's1', name: 'Zzz Single', barcode: 'BCS' });
        await seedProduct(tx, { super_key: 'vea', product_id: 'm1', name: 'Aaa Multi', barcode: 'BCM' });
        await seedProduct(tx, { super_key: 'dia', product_id: 'm2', name: 'Aaa Multi', barcode: 'BCM' });
        const repo = makeCatalogRepo(tx);
        const result = await repo.getGroups({});
        expect(result.data[0]?.super_count).toBe(2);
        expect(result.data[1]?.super_count).toBe(1);
      });
    });

    describe('super filter — include super, still compare', () => {
      it('keeps groups that contain the chosen super and shows ALL variants', async () => {
        await withRollback(async (tx) => {
          await seedProduct(tx, {
            super_key: 'dia',
            product_id: 'd1',
            name: 'P',
            barcode: 'BCX',
            raw_price: 50,
          });
          await seedProduct(tx, {
            super_key: 'vea',
            product_id: 'v1',
            name: 'P',
            barcode: 'BCX',
            raw_price: 60,
          });
          await seedProduct(tx, { super_key: 'carrefour', product_id: 'c1', name: 'Q', barcode: 'BCY' });
          const repo = makeCatalogRepo(tx);
          const result = await repo.getGroups({ super: 'dia' });
          expect(result.total).toBe(1); // only BCX includes dia
          expect(result.data[0]?.barcode).toBe('BCX');
          expect(result.data[0]?.variants).toHaveLength(2);
        });
      });

      it('drops groups that do not contain the chosen super', async () => {
        await withRollback(async (tx) => {
          await seedProduct(tx, { super_key: 'dia', product_id: 'd1', name: 'P', barcode: 'BCX' });
          await seedProduct(tx, { super_key: 'vea', product_id: 'v1', name: 'P', barcode: 'BCX' });
          await seedProduct(tx, { super_key: 'carrefour', product_id: 'c1', name: 'Q', barcode: 'BCY' });
          const repo = makeCatalogRepo(tx);
          const result = await repo.getGroups({ super: 'carrefour' });
          expect(result.total).toBe(1);
          expect(result.data[0]?.barcode).toBe('BCY');
        });
      });
    });

    describe('sorting', () => {
      it('price_asc orders by lowest effective price (offer_price wins via COALESCE)', async () => {
        await withRollback(async (tx) => {
          await seedProduct(tx, { super_key: 'vea', product_id: 'a1', name: 'Aaa Cheap', barcode: 'BCA', raw_price: 70, offer_price: 50, discount_pct: 0 });
          await seedProduct(tx, { super_key: 'vea', product_id: 'b1', name: 'Bbb Discounted', barcode: 'BCB', raw_price: 80, discount_pct: 30 });
          await seedProduct(tx, { super_key: 'vea', product_id: 'c1', name: 'Ccc Mid', barcode: 'BCC', raw_price: 120, discount_pct: 0 });
          const repo = makeCatalogRepo(tx);
          const result = await repo.getGroups({ sort: 'price_asc' });
          expect(result.data.map((g) => g.barcode)).toEqual(['BCA', 'BCB', 'BCC']);
        });
      });

      it('price_desc reverses the price order', async () => {
        await withRollback(async (tx) => {
          await seedProduct(tx, { super_key: 'vea', product_id: 'a1', name: 'Aaa Cheap', barcode: 'BCA', raw_price: 70, offer_price: 50 });
          await seedProduct(tx, { super_key: 'vea', product_id: 'b1', name: 'Bbb Discounted', barcode: 'BCB', raw_price: 80, discount_pct: 30 });
          await seedProduct(tx, { super_key: 'vea', product_id: 'c1', name: 'Ccc Mid', barcode: 'BCC', raw_price: 120 });
          const repo = makeCatalogRepo(tx);
          const result = await repo.getGroups({ sort: 'price_desc' });
          expect(result.data.map((g) => g.barcode)).toEqual(['BCC', 'BCB', 'BCA']);
        });
      });

      it('relevance and discount_desc float the discounted group to the top', async () => {
        await withRollback(async (tx) => {
          await seedProduct(tx, { super_key: 'vea', product_id: 'a1', name: 'Aaa Cheap', barcode: 'BCA', raw_price: 70, offer_price: 50 });
          await seedProduct(tx, { super_key: 'vea', product_id: 'b1', name: 'Bbb Discounted', barcode: 'BCB', raw_price: 80, discount_pct: 30 });
          await seedProduct(tx, { super_key: 'vea', product_id: 'c1', name: 'Ccc Mid', barcode: 'BCC', raw_price: 120 });
          const repo = makeCatalogRepo(tx);
          expect((await repo.getGroups({ sort: 'relevance' })).data[0]?.barcode).toBe('BCB');
          expect((await repo.getGroups({ sort: 'discount_desc' })).data[0]?.barcode).toBe('BCB');
        });
      });

      it('invalid sort falls back to relevance (no SQL injection / crash)', async () => {
        await withRollback(async (tx) => {
          await seedProduct(tx, { super_key: 'vea', product_id: 'a1', barcode: 'BCA', raw_price: 70 });
          await seedProduct(tx, { super_key: 'vea', product_id: 'b1', barcode: 'BCB', raw_price: 80, discount_pct: 30 });
          await seedProduct(tx, { super_key: 'vea', product_id: 'c1', barcode: 'BCC', raw_price: 120 });
          const repo = makeCatalogRepo(tx);
          const result = await repo.getGroups({ sort: 'name; DROP TABLE products' });
          expect(result.total).toBe(3);
          expect(result.data[0]?.barcode).toBe('BCB');
        });
      });
    });

    it('paginates groups correctly', async () => {
      await withRollback(async (tx) => {
        for (let i = 1; i <= 4; i++) {
          await seedProduct(tx, { super_key: 'vea', product_id: `v${i}`, name: `Product ${i}`, barcode: `BC${i}` });
          await seedProduct(tx, { super_key: 'carrefour', product_id: `c${i}`, name: `Product ${i}`, barcode: `BC${i}` });
        }
        const repo = makeCatalogRepo(tx);
        const page1 = await repo.getGroups({ limit: '2', page: '1' });
        expect(page1.total).toBe(4);
        expect(page1.data).toHaveLength(2);
        expect(page1.pages).toBe(2);
      });
    });
  });

  describe('getCategories', () => {
    it('returns empty array (taxonomy injected at route layer, not repo)', async () => {
      await withRollback(async (tx) => {
        const repo = makeCatalogRepo(tx);
        expect(repo.getCategories()).toEqual([]);
      });
    });
  });
});
