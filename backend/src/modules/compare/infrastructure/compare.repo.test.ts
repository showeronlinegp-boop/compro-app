/**
 * compare.repo.test.ts — Integration tests for makeCompareRepo (Postgres + Prisma).
 *
 * Tests:
 *   1. buildCompareItemsFromSource with qty=1 produces same shape as buildCompareItems (regression parity)
 *   2. qty>1 proves home_price and SuperMatch.price = unit_price × quantity
 *   3. empty source array → returns []
 *   4. (a) effective math end-to-end: nth_unit promo applied correctly
 *   5. (b) ranking flip: DIA cheaper after promo vs MAS without promo
 *   6. (c) Planner regression: qty=1 → price===unit_price (no discount triggered)
 *   7. (d) barcode match carries matched_by='barcode'
 *   8. (e) info_badges: 'other' promo populates badges, price unchanged
 *   9. (f) parsePromotions: malformed JSONB entries are dropped and do NOT produce NaN
 *
 * Uses withRollback() for per-test isolation.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Promotion, SourceRow } from '../../../shared/types.js';
import { testPrisma } from '../../../test/helpers/test-client.js';
import { withRollback } from '../../../test/helpers/with-rollback.js';
import { makeCompareRepo, parsePromotions } from './compare.repo.js';

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
  promotions?: Promotion[];
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
      promotions: opts.promotions ?? [],
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

    it('skips products with no price (raw_price=null, offer_price=null)', async () => {
      await withRollback(async (tx) => {
        const prismaLike = tx as unknown as Parameters<typeof makeCompareRepo>[0];

        // Seed directly — seedProduct defaults raw_price to 100 via ??, so we bypass it
        const priceless = await tx.products.create({
          data: {
            super: 'vea',
            product_id: `noprice-${Date.now()}`,
            name: 'Producto sin precio',
            available: true,
            categories: [],
            raw_price: null,
            offer_price: null,
          },
        });

        const source: SourceRow[] = [{ item_id: 1, product_id: priceless.id, quantity: 1 }];
        const repo = makeCompareRepo(prismaLike);
        const result = await repo.buildCompareItemsFromSource(source);

        // Product with no price must be silently skipped
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

        // Full equality: the only intentional difference is shopping_id (wrapper uses
        // the shopping table PK; source path uses item_id=999 passed directly).
        // Sort matches by super so comparison is order-stable.
        const sortMatches = (item: (typeof viaSource)[0]) => ({
          ...item,
          matches: [...item.matches].sort((a, b) => a.super.localeCompare(b.super)),
        });
        expect(sortMatches(sourceItem)).toEqual({
          ...sortMatches(wrapperItem),
          shopping_id: 999,
        });

        // matchId is seeded and matched via the DB barcode join — not referenced directly in code
        void matchId;
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

        // home_price must be unit × qty (no promos → effective = shelf total)
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

        // option_a cheapest: vea covers both items
        //   item1 at vea: 300×2=600; item2 at vea: 800×3=2400 → vea total=3000
        //   carrefour covers both: 280×2=560; 820×3=2460 → carrefour total=3020
        // cheapest option_a super = vea (3000)
        // savings = 3000 - 2960 = 40
        expect(result.option_b.savings_vs_option_a).toBe(40);
      });
    });

    // ── (a) Effective math end-to-end ──────────────────────────────────────────

    it('(a) nth_unit promo applied: DIA price≈2964 at qty=2, MAS price=3198 (no promo)', async () => {
      await withRollback(async (tx) => {
        const prismaLike = tx as unknown as Parameters<typeof makeCompareRepo>[0];

        const barcode = `bc-promo-${Date.now()}`;
        const diaPromo: Promotion = {
          label: '2do al 80%',
          type: 'nth_unit',
          min_qty: 2,
          discount_pct: 80,
        };

        const homeId = await seedProduct(tx, {
          super_key: 'dia',
          product_id: `dia-${Date.now()}`,
          name: 'Aceite de Girasol 900ml',
          barcode,
          raw_price: 2470,
          promotions: [diaPromo],
        });
        await seedProduct(tx, {
          super_key: 'masonline',
          product_id: `mas-${Date.now()}`,
          name: 'Aceite de Girasol 900ml',
          barcode,
          raw_price: 1599,
          promotions: [],
        });

        const source: SourceRow[] = [{ item_id: 1, product_id: homeId, quantity: 2 }];
        const repo = makeCompareRepo(prismaLike);
        const result = await repo.buildCompareItemsFromSource(source);

        expect(result).toHaveLength(1);
        const item = result[0];
        if (!item) return;

        // DIA: effectiveLineTotal(2470, {N=2,D=80}, 2) = 2470*(1*(2-0.8)+0) = 2470*1.2 = 2964
        const diaMatch = item.matches.find((m) => m.super === 'dia');
        expect(diaMatch).toBeDefined();
        expect(diaMatch?.price).toBeCloseTo(2964, 2);
        expect(diaMatch?.unit_price).toBe(4940); // shelf total: 2470 * 2
        expect(diaMatch?.promo_label).toBe('2do al 80%');

        // MAS: no promo → 1599 × 2 = 3198
        const masMatch = item.matches.find((m) => m.super === 'masonline');
        expect(masMatch).toBeDefined();
        expect(masMatch?.price).toBe(3198); // 1599 * 2
        expect(masMatch?.unit_price).toBe(3198); // shelf total: 1599 * 2
        expect(masMatch?.promo_label).toBeNull();
      });
    });

    // ── (b) Ranking flip: DIA becomes best_super after promo ──────────────────

    it('(b) ranking flip: option_b best_super is "dia" after nth_unit promo makes it cheapest', async () => {
      await withRollback(async (tx) => {
        const prismaLike = tx as unknown as Parameters<typeof makeCompareRepo>[0];
        const { buildCompareResult } = await import('../domain/matcher.js');

        const barcode = `bc-flip-${Date.now()}`;
        const diaPromo: Promotion = {
          label: '2do al 80%',
          type: 'nth_unit',
          min_qty: 2,
          discount_pct: 80,
        };

        const homeId = await seedProduct(tx, {
          super_key: 'dia',
          product_id: `dia-flip-${Date.now()}`,
          name: 'Aceite de Girasol 900ml',
          barcode,
          raw_price: 2470,
          promotions: [diaPromo],
        });
        await seedProduct(tx, {
          super_key: 'masonline',
          product_id: `mas-flip-${Date.now()}`,
          name: 'Aceite de Girasol 900ml',
          barcode,
          raw_price: 1599,
          promotions: [],
        });

        const source: SourceRow[] = [{ item_id: 1, product_id: homeId, quantity: 2 }];
        const repo = makeCompareRepo(prismaLike);
        const items = await repo.buildCompareItemsFromSource(source);
        const compareResult = buildCompareResult(items);

        // DIA effective (2964) < MAS shelf (3198) → DIA is cheapest → best_super = 'dia'
        const breakdown = compareResult.option_b.breakdown[0];
        expect(breakdown).toBeDefined();
        expect(breakdown?.best_super).toBe('dia');
      });
    });

    // ── (c) Planner regression: qty=1 → effective price = shelf price ─────────

    it('(c) Planner regression: qty=1 with nth_unit promo → price===unit_price (no discount triggered)', async () => {
      await withRollback(async (tx) => {
        const prismaLike = tx as unknown as Parameters<typeof makeCompareRepo>[0];

        const diaPromo: Promotion = {
          label: '2do al 80%',
          type: 'nth_unit',
          min_qty: 2,
          discount_pct: 80,
        };

        const homeId = await seedProduct(tx, {
          super_key: 'dia',
          product_id: `dia-planner-${Date.now()}`,
          name: 'Aceite de Girasol 900ml',
          raw_price: 2470,
          promotions: [diaPromo],
        });

        // qty=1: groups=floor(1/2)=0, rem=1 → effectiveLineTotal=2470*(0+1)=2470
        const source: SourceRow[] = [{ item_id: 1, product_id: homeId, quantity: 1 }];
        const repo = makeCompareRepo(prismaLike);
        const result = await repo.buildCompareItemsFromSource(source);

        expect(result).toHaveLength(1);
        const item = result[0];
        if (!item) return;

        // home fields — qty=1, no nth_unit triggers at qty<min_qty
        expect(item.home_price).toBe(2470); // effective = shelf (no discount)
        expect(item.home_unit_price).toBe(2470); // shelf total = 2470*1

        // DIA match in its own super
        const diaMatch = item.matches.find((m) => m.super === 'dia');
        expect(diaMatch).toBeDefined();
        expect(diaMatch?.price).toBe(2470); // effective === shelf
        expect(diaMatch?.unit_price).toBe(2470); // shelf × 1
      });
    });

    // ── (d) matched_by field: barcode match is correctly labelled ─────────────
    //
    // Note: the barcode-over-name_similarity tie-break in the dedup loop fires
    // only when the same (product_id, match_super) pair appears in BOTH the
    // barcodeMatches and similarityMatches arrays. Because the engine gates on
    // `withBarcodeMatch` — products that already have a barcode match are excluded
    // from the similarity query — this same-super collision is unreachable through
    // buildCompareItemsFromSource. The dedup comparator logic is covered via
    // unit tests in promo-math.test.ts.
    //
    // What this test ACTUALLY verifies: when a barcode join fires, the resulting
    // SuperMatch carries matched_by='barcode', proving the field is populated
    // from the right query path.

    it('(d) barcode match carries matched_by="barcode" (tie-break path is unreachable via public API)', async () => {
      await withRollback(async (tx) => {
        const prismaLike = tx as unknown as Parameters<typeof makeCompareRepo>[0];

        const barcode = `bc-tiebreak-${Date.now()}`;
        const categoryKey = `cat-${Date.now()}`;

        // See block comment above the it() call for why the same-super collision
        // is unreachable. This test verifies matched_by='barcode' is set correctly.

        const homeId = await seedProduct(tx, {
          super_key: 'vea',
          product_id: `home-tb-${Date.now()}`,
          name: 'Aceite Girasol 1L',
          barcode,
          raw_price: 500,
          category_key: categoryKey,
        });

        await seedProduct(tx, {
          super_key: 'carrefour',
          product_id: `match-bc-${Date.now()}`,
          name: 'Aceite Girasol 1L',
          barcode,
          raw_price: 500,
          category_key: categoryKey,
        });

        const source: SourceRow[] = [{ item_id: 1, product_id: homeId, quantity: 1 }];
        const repo = makeCompareRepo(prismaLike);
        const result = await repo.buildCompareItemsFromSource(source);

        expect(result).toHaveLength(1);
        const item = result[0];
        if (!item) return;

        const carrefourMatch = item.matches.find((m) => m.super === 'carrefour');
        expect(carrefourMatch).toBeDefined();
        expect(carrefourMatch?.matched_by).toBe('barcode');
      });
    });

    // ── (e) info_badges: 'other' promo → badge populated, price unchanged ─────

    it('(e) info_badges: "other" promo → badge in info_badges, price unchanged, promo_label null', async () => {
      await withRollback(async (tx) => {
        const prismaLike = tx as unknown as Parameters<typeof makeCompareRepo>[0];

        const barcode = `bc-badge-${Date.now()}`;
        const otherPromo: Promotion = {
          label: 'Cuotas sin interés',
          type: 'other',
          min_qty: null,
          discount_pct: null,
        };

        const homeId = await seedProduct(tx, {
          super_key: 'vea',
          product_id: `home-badge-${Date.now()}`,
          name: 'Arroz Largo Fino 1kg',
          barcode,
          raw_price: 800,
          promotions: [otherPromo],
        });
        // Second match product so we have a cross-super match to inspect
        await seedProduct(tx, {
          super_key: 'carrefour',
          product_id: `match-badge-${Date.now()}`,
          name: 'Arroz Largo Fino 1kg',
          barcode,
          raw_price: 850,
          promotions: [],
        });

        const source: SourceRow[] = [{ item_id: 1, product_id: homeId, quantity: 2 }];
        const repo = makeCompareRepo(prismaLike);
        const result = await repo.buildCompareItemsFromSource(source);

        expect(result).toHaveLength(1);
        const item = result[0];
        if (!item) return;

        // Home item (vea): 'other' promo → no discount applied; badge in home_info_badges
        expect(item.home_price).toBe(1600); // 800 * 2, no discount
        expect(item.home_unit_price).toBe(1600); // shelf total: 800 * 2
        expect(item.home_promo_label).toBeNull(); // 'other' doesn't set promo_label
        expect(item.home_info_badges).toContain('Cuotas sin interés');

        // vea match also has the 'other' promo (same product) — badge populated
        const veaMatch = item.matches.find((m) => m.super === 'vea');
        expect(veaMatch).toBeDefined();
        expect(veaMatch?.price).toBe(1600); // 800 * 2, no effective discount
        expect(veaMatch?.promo_label).toBeNull();
        expect(veaMatch?.info_badges).toContain('Cuotas sin interés');
      });
    });
  });

  // ── (f) parsePromotions: JSONB type validation ─────────────────────────────

  describe('parsePromotions', () => {
    it('drops malformed entries and does NOT produce NaN in effective price', () => {
      // A crawled blob with min_qty as a string and discount_pct as null is malformed.
      // It must be discarded — not cast through — so ranking never sees NaN.
      const raw: unknown[] = [
        { type: 'nth_unit', label: 'Bad entry', min_qty: 'two', discount_pct: null },
        { type: 'other', label: 42, min_qty: null, discount_pct: null }, // label not a string
        { type: 'unknown_type', label: 'Also bad', min_qty: 2, discount_pct: 80 }, // bad type
        null, // primitive
        { type: 'nth_unit', label: '2do al 80%', min_qty: 2, discount_pct: 80 }, // valid
        { type: 'other', label: 'Cuotas sin interés', min_qty: null, discount_pct: null }, // valid
      ];

      const result = parsePromotions(raw);

      // Only the two valid entries survive.
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        type: 'nth_unit',
        label: '2do al 80%',
        min_qty: 2,
        discount_pct: 80,
      });
      expect(result[1]).toEqual({
        type: 'other',
        label: 'Cuotas sin interés',
        min_qty: null,
        discount_pct: null,
      });

      // No entry in the result may carry NaN in a numeric field.
      for (const p of result) {
        if (p.min_qty !== null) expect(Number.isNaN(p.min_qty)).toBe(false);
        if (p.discount_pct !== null) expect(Number.isNaN(p.discount_pct)).toBe(false);
      }
    });

    it('returns [] for an empty array', () => {
      expect(parsePromotions([])).toEqual([]);
    });

    it('returns [] when all entries are malformed', () => {
      const raw: unknown[] = [
        { type: 'nth_unit', label: 'Bad', min_qty: 'two', discount_pct: null },
        { type: 'other', label: 123, min_qty: null, discount_pct: null },
      ];
      expect(parsePromotions(raw)).toEqual([]);
    });
  });
});
