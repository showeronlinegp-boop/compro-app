/**
 * enricher.service.test.ts — Unit tests for the enricher service (Prisma mock).
 *
 * Uses vi.fn() mocks for the Prisma client and the VTEX API clients.
 * No real database is required — prisma.products.findMany and .update are stubbed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import promotionsVea from '../../infrastructure/vtex/__fixtures__/promotions-vea.json' with {
  type: 'json',
};
import { isRunning } from './enrich-state.js';
import { makeEnricher } from './enricher.service.js';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../../infrastructure/vtex/catalog-client.js', () => ({
  fetchSkuId: vi.fn(),
}));
vi.mock('../../infrastructure/vtex/promotions-client.js', () => ({
  fetchSearchPromotions: vi.fn(),
  fetchPromoPrice: vi.fn(),
}));
vi.mock('../../infrastructure/vtex/simulation-client.js', () => ({
  fetchSimulationPromos: vi.fn(),
}));

import { fetchSkuId } from '../../infrastructure/vtex/catalog-client.js';
import {
  fetchPromoPrice,
  fetchSearchPromotions,
} from '../../infrastructure/vtex/promotions-client.js';
import { fetchSimulationPromos } from '../../infrastructure/vtex/simulation-client.js';

// ── Prisma mock factory ───────────────────────────────────────────────────────

interface MockProduct {
  id: number;
  super: string;
  product_id: string;
  sku_id: string | null;
  raw_price: number;
  product_url: string | null;
  offer_price: number | null;
  discount_pct: number;
}

function makeMockPrisma(initialRows: MockProduct[] = []) {
  // mutable store so update() is reflected in later queries
  const store: MockProduct[] = [...initialRows];

  return {
    products: {
      findMany: vi.fn().mockImplementation(({ where }: { where?: { super?: string } } = {}) => {
        const rows = where?.super ? store.filter((r) => r.super === where.super) : [...store];
        return Promise.resolve(rows);
      }),
      update: vi.fn().mockImplementation(
        ({
          where,
          data,
        }: {
          where: { id: number };
          data: Partial<MockProduct>;
        }) => {
          const row = store.find((r) => r.id === where.id);
          if (row) Object.assign(row, data);
          return Promise.resolve(row ?? null);
        },
      ),
    },
  };
}

function makeRow(overrides: Partial<MockProduct> = {}): MockProduct {
  return {
    id: overrides.id ?? 1,
    super: overrides.super ?? 'vea',
    product_id: overrides.product_id ?? 'prod-1',
    sku_id:
      Object.prototype.hasOwnProperty.call(overrides, 'sku_id') ? overrides.sku_id! : '336191',
    raw_price: overrides.raw_price ?? 10000,
    product_url: overrides.product_url ?? 'https://example.com/p',
    offer_price: overrides.offer_price ?? null,
    discount_pct: overrides.discount_pct ?? 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('enricher.service — Strategy A (search-promotions / vea)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches to fetchSearchPromotions (Strategy A) when promoSeller is set', async () => {
    const prisma = makeMockPrisma([makeRow({ super: 'vea', sku_id: '336191' })]);
    (fetchSearchPromotions as ReturnType<typeof vi.fn>).mockResolvedValue(promotionsVea);

    const enricher = makeEnricher(prisma as never);
    await enricher.enrichSuper('vea');

    expect(fetchSearchPromotions).toHaveBeenCalledWith(
      'https://www.vea.com.ar',
      'jumboargentinav700cordoba700',
      ['336191'],
    );
    expect(fetchPromoPrice).not.toHaveBeenCalled();
  });

  it('writes offer_price and discount_pct from Strategy A promo result', async () => {
    const row = makeRow({ super: 'vea', sku_id: '336191', raw_price: 10000 });
    const prisma = makeMockPrisma([row]);
    (fetchSearchPromotions as ReturnType<typeof vi.fn>).mockResolvedValue(promotionsVea);

    const enricher = makeEnricher(prisma as never);
    await enricher.enrichSuper('vea');

    // SKU 336191 has effectiveDiscount=0.37 in fixture
    // offer_price = round(10000 * (1 - 0.37) * 100) / 100 = 6300
    // discount_pct = round(0.37 * 100) = 37
    expect(row.offer_price).toBe(6300);
    expect(row.discount_pct).toBe(37);
  });

  it('fetches missing sku_ids before calling search-promotions', async () => {
    const row = makeRow({ super: 'vea', sku_id: null });
    const prisma = makeMockPrisma([row]);
    (fetchSkuId as ReturnType<typeof vi.fn>).mockResolvedValue('336191');
    (fetchSearchPromotions as ReturnType<typeof vi.fn>).mockResolvedValue(promotionsVea);

    const enricher = makeEnricher(prisma as never);
    await enricher.enrichSuper('vea');

    expect(fetchSkuId).toHaveBeenCalledWith({ baseUrl: 'https://www.vea.com.ar' }, 'prod-1');
    expect(fetchSearchPromotions).toHaveBeenCalled();
  });

  it('EnrichStatus: running=true during run, running=false after', async () => {
    const prisma = makeMockPrisma([makeRow({ super: 'vea', sku_id: '336191' })]);
    let wasRunningDuringFetch = false;

    (fetchSearchPromotions as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      wasRunningDuringFetch = isRunning('vea');
      return promotionsVea;
    });

    const enricher = makeEnricher(prisma as never);
    await enricher.enrichSuper('vea');

    expect(wasRunningDuringFetch).toBe(true);
    expect(isRunning('vea')).toBe(false);

    const st = enricher.getStatus();
    expect(st.vea?.running).toBe(false);
    expect(st.vea?.total).toBe(1);
    expect(st.vea?.done).toBeGreaterThan(0);
  });

  it('throws 409-style error and stays not-running when already running', async () => {
    const prisma = makeMockPrisma([makeRow({ super: 'vea', sku_id: '336191' })]);
    let resolvePromo!: (v: unknown) => void;
    const pendingPromo = new Promise((res) => {
      resolvePromo = res;
    });

    (fetchSearchPromotions as ReturnType<typeof vi.fn>).mockReturnValue(pendingPromo);

    const enricher = makeEnricher(prisma as never);
    const first = enricher.enrichSuper('vea');

    // Flush microtasks so the first call's findMany resolves and setStatus(running=true) runs
    // before we make the second call. Without this, the second call sees running=false.
    await Promise.resolve();

    // second call while first is in flight
    await expect(enricher.enrichSuper('vea')).rejects.toThrow(/ya en curso/);

    resolvePromo(promotionsVea);
    await first;
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('enricher.service — Strategy B (JSON-LD HTML / dia)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches to fetchPromoPrice (Strategy B) when no promoSeller', async () => {
    const prisma = makeMockPrisma([
      makeRow({ super: 'dia', product_url: 'https://diaonline.supermercadosdia.com.ar/p', raw_price: 2000 }),
    ]);
    (fetchPromoPrice as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: 'found',
      result: { promoPrice: 1575, listPrice: null },
    });

    const enricher = makeEnricher(prisma as never);
    await enricher.enrichSuper('dia');

    expect(fetchPromoPrice).toHaveBeenCalledWith(
      'https://diaonline.supermercadosdia.com.ar/p',
      'https://diaonline.supermercadosdia.com.ar',
    );
    expect(fetchSearchPromotions).not.toHaveBeenCalled();
  });

  it('writes offer_price and discount_pct from Strategy B result (dia)', async () => {
    const row = makeRow({
      super: 'dia',
      product_url: 'https://diaonline.supermercadosdia.com.ar/p',
      raw_price: 2000,
    });
    const prisma = makeMockPrisma([row]);
    (fetchPromoPrice as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: 'found',
      result: { promoPrice: 1575, listPrice: null },
    });

    const enricher = makeEnricher(prisma as never);
    await enricher.enrichSuper('dia');

    // basePrice = rawPrice=2000 (listPrice null)
    // pct = round((2000 - 1575) / 2000 * 100) = round(21.25) = 21
    expect(row.offer_price).toBe(1575);
    expect(row.discount_pct).toBe(21);
  });

  it('carrefour: writes nothing when fetchPromoPrice returns no_data', async () => {
    const row = makeRow({
      super: 'carrefour',
      product_url: 'https://www.carrefour.com.ar/p',
      raw_price: 5000,
    });
    const prisma = makeMockPrisma([row]);
    (fetchPromoPrice as ReturnType<typeof vi.fn>).mockResolvedValue({ kind: 'no_data' });

    const enricher = makeEnricher(prisma as never);
    await enricher.enrichSuper('carrefour');

    expect(row.offer_price).toBeNull();
    expect(row.discount_pct).toBe(0);
  });

  it('carrefour: writes nothing when fetchPromoPrice returns fetch_error', async () => {
    const row = makeRow({
      super: 'carrefour',
      product_url: 'https://www.carrefour.com.ar/p',
      raw_price: 5000,
    });
    const prisma = makeMockPrisma([row]);
    (fetchPromoPrice as ReturnType<typeof vi.fn>).mockResolvedValue({ kind: 'fetch_error' });

    const enricher = makeEnricher(prisma as never);
    await enricher.enrichSuper('carrefour');

    expect(row.offer_price).toBeNull();
    expect(row.discount_pct).toBe(0);
  });

  it('EnrichStatus: done count matches total after run', async () => {
    const prisma = makeMockPrisma([
      makeRow({ super: 'dia', id: 1, product_url: 'https://diaonline.supermercadosdia.com.ar/p1' }),
      makeRow({ super: 'dia', id: 2, product_id: 'prod-2', product_url: 'https://diaonline.supermercadosdia.com.ar/p2' }),
    ]);
    (fetchPromoPrice as ReturnType<typeof vi.fn>).mockResolvedValue({ kind: 'no_data' });

    const enricher = makeEnricher(prisma as never);
    await enricher.enrichSuper('dia');

    const st = enricher.getStatus();
    expect(st.dia?.total).toBe(2);
    expect(st.dia?.done).toBe(2);
    expect(st.dia?.running).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("enricher.service — Strategy 'none' (carrefour)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("performs NO fetches when enrichStrategy='none' (carrefour)", async () => {
    const prisma = makeMockPrisma([
      makeRow({ super: 'carrefour', id: 1, product_url: 'https://www.carrefour.com.ar/p', raw_price: 5000 }),
      makeRow({ super: 'carrefour', id: 2, product_id: 'prod-2', product_url: 'https://www.carrefour.com.ar/p2', raw_price: 3000 }),
    ]);

    const enricher = makeEnricher(prisma as never);
    await enricher.enrichSuper('carrefour');

    expect(fetchPromoPrice).not.toHaveBeenCalled();
    expect(fetchSearchPromotions).not.toHaveBeenCalled();
    expect(fetchSkuId).not.toHaveBeenCalled();
  });

  it("sets updated=0 and done=total when enrichStrategy='none'", async () => {
    const prisma = makeMockPrisma([
      makeRow({ super: 'carrefour', id: 1, raw_price: 5000 }),
      makeRow({ super: 'carrefour', id: 2, product_id: 'prod-2', raw_price: 3000 }),
    ]);

    const enricher = makeEnricher(prisma as never);
    await enricher.enrichSuper('carrefour');

    const st = enricher.getStatus();
    expect(st.carrefour?.updated).toBe(0);
    expect(st.carrefour?.done).toBe(2);
    expect(st.carrefour?.total).toBe(2);
    expect(st.carrefour?.running).toBe(false);
    expect(st.carrefour?.error).toBeNull();
  });

  it("leaves existing crawl discounts untouched when enrichStrategy='none'", async () => {
    const row = makeRow({
      super: 'carrefour',
      id: 1,
      product_url: 'https://www.carrefour.com.ar/p',
      raw_price: 5000,
      offer_price: 4000,
      discount_pct: 20,
    });
    const prisma = makeMockPrisma([row]);

    const enricher = makeEnricher(prisma as never);
    await enricher.enrichSuper('carrefour');

    // The mock store values must remain unchanged (update was never called)
    expect(row.offer_price).toBe(4000);
    expect(row.discount_pct).toBe(20);
    expect(prisma.products.update).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('enricher.service — Strategy C (checkout simulation / masonline)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches to fetchSimulationPromos (Strategy C) for masonline', async () => {
    const prisma = makeMockPrisma([
      makeRow({ super: 'masonline', sku_id: '134066', raw_price: 2779 }),
    ]);
    (fetchSimulationPromos as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: 'found',
      result: { unitPrice: 549, listPrice: 549, benefitNames: [] },
    });

    const enricher = makeEnricher(prisma as never);
    await enricher.enrichSuper('masonline');

    expect(fetchSimulationPromos).toHaveBeenCalled();
    expect(fetchSearchPromotions).not.toHaveBeenCalled();
    expect(fetchPromoPrice).not.toHaveBeenCalled();
  });

  it('writes the nth_unit PromoVolumen promo and clears offer_price', async () => {
    const row = makeRow({ super: 'masonline', id: 1, sku_id: '134066', raw_price: 5000 });
    const prisma = makeMockPrisma([row]);
    (fetchSimulationPromos as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: 'found',
      result: { unitPrice: 1500, listPrice: 1500, benefitNames: ['2da al 70%'] },
    });

    const enricher = makeEnricher(prisma as never);
    await enricher.enrichSuper('masonline');

    expect(prisma.products.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        offer_price: null,
        discount_pct: 0,
        promotions: [{ label: '2da al 70%', type: 'nth_unit', min_qty: 2, discount_pct: 70 }],
      },
    });
  });

  it('does NOT apply the simulation flat price — leaves the region-accurate crawl value (regression)', async () => {
    // Bug: seller "1"/sc=1 simulation returns a non-selected zone's price ($549),
    // overwriting Pergamino's region-accurate raw_price ($2.779). With no nth_unit
    // promo, the simulation must NOT touch the row.
    const row = makeRow({
      super: 'masonline',
      id: 1,
      sku_id: '134066',
      raw_price: 2779,
      offer_price: null,
      discount_pct: 0,
    });
    const prisma = makeMockPrisma([row]);
    (fetchSimulationPromos as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: 'found',
      result: { unitPrice: 549, listPrice: 549, benefitNames: [] },
    });

    const enricher = makeEnricher(prisma as never);
    await enricher.enrichSuper('masonline');

    expect(prisma.products.update).not.toHaveBeenCalled();
    expect(row.offer_price).toBeNull();
    expect(row.discount_pct).toBe(0);

    const st = enricher.getStatus();
    expect(st.masonline?.updated).toBe(0);
    expect(st.masonline?.done).toBe(1);
  });

  it('skips rows with no sku_id and never calls the simulation for them', async () => {
    const prisma = makeMockPrisma([
      makeRow({ super: 'masonline', id: 1, sku_id: null, raw_price: 2779 }),
    ]);

    const enricher = makeEnricher(prisma as never);
    await enricher.enrichSuper('masonline');

    expect(fetchSimulationPromos).not.toHaveBeenCalled();
    expect(prisma.products.update).not.toHaveBeenCalled();
  });
});
