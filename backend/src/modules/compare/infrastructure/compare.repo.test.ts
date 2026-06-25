/**
 * compare.repo.test.ts — Integration tests for makeCompareRepo (Postgres + Prisma).
 *
 * Tests:
 *   1. buildCompareItemsFromSource with qty=1 produces same shape as buildCompareItems (regression parity)
 *   2. qty>1 proves home_price and SuperMatch.price = unit_price × quantity
 *   3. empty source array → returns []
 *
 * Uses withRollback() for per-test isolation.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SourceRow } from '../../../shared/types.js';
import { testPrisma } from '../../../test/helpers/test-client.js';
import { withRollback } from '../../../test/helpers/with-rollback.js';
import { makeCompareRepo } from './compare.repo.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Tx = Parameters<Parameters<typeof testPrisma.$transaction>[0]>[0];

interface SeedProductOptions {
  super_key?: string;
  product_id?: string;
  name?: string;
  barcode?: string | null;
  raw_price?: number | null;
  offer_price?: number | null;
  category_key?: string | null;
  available?: boolean;
}

async function seedProduct(tx: Tx, opts: SeedProductOptions = {}): Promise<number> {
  const result = await tx.products.create({
    data: {
      super: opts.super_key ?? 'vea',
      product_id: opts.product_id ?? `pid-${Date.now()}-${Math.random()}`,
      name: opts.name ?? 'Test Product',
      available: opts.available ?? true,
      categories: [],
      barcode: opts.barcode ?? null,
      raw_price: opts.raw_price ?? 100,
      offer_price: opts.offer_price ?? null,
      category_key: opts.category_key ?? null,
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

describe('makeCompareRepo', () => {
  describe('buildCompareItemsFromSource', () => {
    it('returns [] for empty source array', async () => {
      await withRollback(async (tx) => {
        // makeCompareRepo requires PrismaClient; tx is compatible for our queries
        const repo = makeCompareRepo(tx as unknown as Parameters<typeof makeCompareRepo>[0]);
        const result = await repo.buildCompareItemsFromSource([]);
        expect(result).toEqual([]);
      });
    });

    it('qty=1: produces same CompareItem shape as buildCompareItems wrapper', async () => {
      await withRollback(async (tx) => {
        const prismaLike = tx as unknown as Parameters<typeof makeCompareRepo>[0];

        // Seed a home product (vea) and a barcode-match in another super
        const barcode = `bc-${Date.now()}`;
        const homeId = await seedProduct(tx, {
          super_key: 'vea',
          product_id: `home-${Date.now()}`,
          name: 'Leche Entera 1L',
          barcode,
          raw_price: 500,
        });
        const matchId = await seedProduct(tx, {
          super_key: 'carrefour',
          product_id: `match-${Date.now()}`,
          name: 'Leche Entera 1L',
          barcode,
          raw_price: 480,
        });

        // Seed a shopping row pointing to homeId so buildCompareItems can see it
        await tx.$executeRaw`
          INSERT INTO shopping (product_id, frequency_days)
          VALUES (${homeId}, 7)
        `;

        const repo = makeCompareRepo(prismaLike);

        // Call via the wrapper (shopping → SourceRow qty=1 → source fn)
        const viaWrapper = await repo.buildCompareItems();

        // Call via source function directly with qty=1
        const source: SourceRow[] = [{ item_id: 999, product_id: homeId, quantity: 1 }];
        const viaSource = await repo.buildCompareItemsFromSource(source);

        // Both should have exactly one item for homeId
        const wrapperItem = viaWrapper.find((i) => i.home_super === 'vea');
        const sourceItem = viaSource[0];

        expect(wrapperItem).toBeDefined();
        expect(sourceItem).toBeDefined();
        if (!wrapperItem || !sourceItem) return;

        // Shape parity: same home_super, same home_price, same number of matches
        expect(sourceItem.home_super).toBe(wrapperItem.home_super);
        expect(sourceItem.home_price).toBe(wrapperItem.home_price);
        expect(sourceItem.matches).toHaveLength(wrapperItem.matches.length);

        // The barcode match (carrefour) should appear in both
        const wrapperCarrefour = wrapperItem.matches.find((m) => m.super === 'carrefour');
        const sourceCarrefour = sourceItem.matches.find((m) => m.super === 'carrefour');
        expect(wrapperCarrefour).toBeDefined();
        expect(sourceCarrefour).toBeDefined();
        expect(sourceCarrefour?.price).toBe(wrapperCarrefour?.price);

        void matchId; // referenced above via barcode join
      });
    });

    it('qty>1: home_price and SuperMatch.price = unit_price × quantity', async () => {
      await withRollback(async (tx) => {
        const prismaLike = tx as unknown as Parameters<typeof makeCompareRepo>[0];

        const barcode = `bcqty-${Date.now()}`;
        const homeId = await seedProduct(tx, {
          super_key: 'vea',
          product_id: `home-qty-${Date.now()}`,
          name: 'Yogur Natural 500g',
          barcode,
          raw_price: 200, // unit price
        });
        await seedProduct(tx, {
          super_key: 'dia',
          product_id: `match-qty-${Date.now()}`,
          name: 'Yogur Natural 500g',
          barcode,
          raw_price: 190, // unit price at dia
        });

        const qty = 3;
        const source: SourceRow[] = [{ item_id: 42, product_id: homeId, quantity: qty }];

        const repo = makeCompareRepo(prismaLike);
        const result = await repo.buildCompareItemsFromSource(source);

        expect(result).toHaveLength(1);
        const item = result[0];
        expect(item).toBeDefined();
        if (!item) return;

        // home_price must be unit × qty
        expect(item.home_price).toBe(200 * qty);
        expect(item.shopping_id).toBe(42);

        // home match (vea) price = 200 × 3 = 600
        const veaMatch = item.matches.find((m) => m.super === 'vea');
        expect(veaMatch).toBeDefined();
        expect(veaMatch?.price).toBe(200 * qty);

        // dia match price = 190 × 3 = 570
        const diaMatch = item.matches.find((m) => m.super === 'dia');
        expect(diaMatch).toBeDefined();
        expect(diaMatch?.price).toBe(190 * qty);
      });
    });

    it('qty>1: option_b total = sum of line totals (best_super prices × qty)', async () => {
      await withRollback(async (tx) => {
        const prismaLike = tx as unknown as Parameters<typeof makeCompareRepo>[0];
        const { buildCompareResult } = await import('../domain/matcher.js');

        const bc1 = `bctot1-${Date.now()}`;
        const bc2 = `bctot2-${Date.now() + 1}`;

        const home1 = await seedProduct(tx, {
          super_key: 'vea',
          product_id: `h1-${Date.now()}`,
          name: 'Arroz 1kg',
          barcode: bc1,
          raw_price: 300,
        });
        await seedProduct(tx, {
          super_key: 'carrefour',
          product_id: `m1-${Date.now()}`,
          name: 'Arroz 1kg',
          barcode: bc1,
          raw_price: 280, // cheaper at carrefour
        });

        const home2 = await seedProduct(tx, {
          super_key: 'vea',
          product_id: `h2-${Date.now() + 1}`,
          name: 'Aceite 900ml',
          barcode: bc2,
          raw_price: 800,
        });
        await seedProduct(tx, {
          super_key: 'carrefour',
          product_id: `m2-${Date.now() + 1}`,
          name: 'Aceite 900ml',
          barcode: bc2,
          raw_price: 820, // more expensive at carrefour
        });

        const source: SourceRow[] = [
          { item_id: 1, product_id: home1, quantity: 2 }, // best: carrefour 280×2=560
          { item_id: 2, product_id: home2, quantity: 3 }, // best: vea 800×3=2400
        ];

        const repo = makeCompareRepo(prismaLike);
        const items = await repo.buildCompareItemsFromSource(source);
        const result = buildCompareResult(items);

        // option_b total = 560 + 2400 = 2960
        expect(result.option_b.total).toBe(2960);
      });
    });
  });
});
