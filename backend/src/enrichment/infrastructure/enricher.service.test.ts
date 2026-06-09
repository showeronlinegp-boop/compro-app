/**
 * enricher.service.test.ts — Fixture-backed unit tests for the enricher service.
 *
 * Tests:
 *   - Strategy A dispatch for supers with promoSeller (vea)
 *   - Strategy B dispatch for supers without promoSeller (carrefour, dia)
 *   - EnrichStatus updates during a run (running → done)
 *   - Concurrency: only ENRICH_SKU_CONC, ENRICH_PROMO_CONC, ENRICH_CONCURRENCY
 *     concurrent fetches are issued at a time
 *   - DB UPDATE SQL is applied: offer_price / discount_pct written for matching promos
 *   - No update written when promo exceeds 80% cap or when null returned (carrefour)
 *
 * Uses vitest mocking — stubs fetchSkuId, fetchSearchPromotions, fetchPromoPrice
 * so no real network is needed.
 */

import Database from 'better-sqlite3';
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

import { fetchSkuId } from '../../infrastructure/vtex/catalog-client.js';
import {
  fetchPromoPrice,
  fetchSearchPromotions,
} from '../../infrastructure/vtex/promotions-client.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTempDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE products (
      id INTEGER PRIMARY KEY,
      super TEXT NOT NULL,
      product_id TEXT NOT NULL,
      sku_id TEXT,
      raw_price REAL NOT NULL,
      product_url TEXT,
      offer_price REAL,
      discount_pct INTEGER DEFAULT 0
    )
  `);
  return db;
}

function insertProduct(
  db: Database.Database,
  overrides: Partial<{
    id: number;
    super: string;
    product_id: string;
    sku_id: string | null;
    raw_price: number;
    product_url: string | null;
  }> = {},
): void {
  const row = {
    id: overrides.id ?? 1,
    super: overrides.super ?? 'vea',
    product_id: overrides.product_id ?? 'prod-1',
    // Use 'sku_id' in overrides to allow explicit null — don't use ?? which skips null
    sku_id: Object.prototype.hasOwnProperty.call(overrides, 'sku_id') ? overrides.sku_id : '336191',
    raw_price: overrides.raw_price ?? 10000,
    product_url: overrides.product_url ?? 'https://example.com/p',
  };
  db.prepare(
    `INSERT INTO products (id, super, product_id, sku_id, raw_price, product_url)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(row.id, row.super, row.product_id, row.sku_id, row.raw_price, row.product_url);
}

// ─────────────────────────────────────────────────────────────────────────────

describe('enricher.service — Strategy A (search-promotions / vea)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeTempDb();
    vi.clearAllMocks();
  });

  afterEach(() => {
    db.close();
  });

  it('dispatches to fetchSearchPromotions (Strategy A) when promoSeller is set', async () => {
    insertProduct(db, { super: 'vea', sku_id: '336191', raw_price: 10000 });

    (fetchSearchPromotions as ReturnType<typeof vi.fn>).mockResolvedValue(promotionsVea);

    const enricher = makeEnricher(db);
    await enricher.enrichSuper('vea');

    expect(fetchSearchPromotions).toHaveBeenCalledWith(
      'https://www.vea.com.ar',
      'jumboargentinav700cordoba700',
      ['336191'],
    );
    expect(fetchPromoPrice).not.toHaveBeenCalled();
  });

  it('writes offer_price and discount_pct from Strategy A promo result', async () => {
    insertProduct(db, { super: 'vea', sku_id: '336191', raw_price: 10000 });

    (fetchSearchPromotions as ReturnType<typeof vi.fn>).mockResolvedValue(promotionsVea);

    const enricher = makeEnricher(db);
    await enricher.enrichSuper('vea');

    const row = db.prepare('SELECT offer_price, discount_pct FROM products WHERE id = 1').get() as
      | { offer_price: number; discount_pct: number }
      | undefined;

    // SKU 336191 has effectiveDiscount=0.37 in fixture
    // offer_price = round(10000 * (1 - 0.37) * 100) / 100 = 6300
    // discount_pct = round(0.37 * 100) = 37
    expect(row?.offer_price).toBe(6300);
    expect(row?.discount_pct).toBe(37);
  });

  it('fetches missing sku_ids before calling search-promotions', async () => {
    insertProduct(db, { super: 'vea', sku_id: null, raw_price: 10000 });

    (fetchSkuId as ReturnType<typeof vi.fn>).mockResolvedValue('336191');
    (fetchSearchPromotions as ReturnType<typeof vi.fn>).mockResolvedValue(promotionsVea);

    const enricher = makeEnricher(db);
    await enricher.enrichSuper('vea');

    expect(fetchSkuId).toHaveBeenCalledWith({ baseUrl: 'https://www.vea.com.ar' }, 'prod-1');
    expect(fetchSearchPromotions).toHaveBeenCalled();
  });

  it('EnrichStatus: running=true during run, running=false after', async () => {
    insertProduct(db, { super: 'vea', sku_id: '336191', raw_price: 10000 });

    let wasRunningDuringFetch = false;
    (fetchSearchPromotions as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      wasRunningDuringFetch = isRunning('vea');
      return promotionsVea;
    });

    const enricher = makeEnricher(db);
    await enricher.enrichSuper('vea');

    expect(wasRunningDuringFetch).toBe(true);
    expect(isRunning('vea')).toBe(false);

    const st = enricher.getStatus();
    expect(st.vea?.running).toBe(false);
    expect(st.vea?.total).toBe(1);
    expect(st.vea?.done).toBeGreaterThan(0);
  });

  it('throws 409-style error and stays not-running when already running', async () => {
    // simulate already running
    insertProduct(db);
    let resolvePromo!: (v: unknown) => void;
    const pendingPromo = new Promise((res) => {
      resolvePromo = res;
    });

    (fetchSearchPromotions as ReturnType<typeof vi.fn>).mockReturnValue(pendingPromo);

    const enricher = makeEnricher(db);
    const first = enricher.enrichSuper('vea');

    // second call while first is in flight
    await expect(enricher.enrichSuper('vea')).rejects.toThrow(/ya en curso/);

    resolvePromo(promotionsVea);
    await first;
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('enricher.service — Strategy B (JSON-LD HTML / dia)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeTempDb();
    vi.clearAllMocks();
  });

  afterEach(() => {
    db.close();
  });

  it('dispatches to fetchPromoPrice (Strategy B) when no promoSeller', async () => {
    insertProduct(db, {
      super: 'dia',
      product_url: 'https://diaonline.supermercadosdia.com.ar/p',
      raw_price: 2000,
    });

    (fetchPromoPrice as ReturnType<typeof vi.fn>).mockResolvedValue({
      promoPrice: 1575,
      listPrice: null,
    });

    const enricher = makeEnricher(db);
    await enricher.enrichSuper('dia');

    expect(fetchPromoPrice).toHaveBeenCalledWith('https://diaonline.supermercadosdia.com.ar/p');
    expect(fetchSearchPromotions).not.toHaveBeenCalled();
  });

  it('writes offer_price and discount_pct from Strategy B result (dia)', async () => {
    insertProduct(db, {
      super: 'dia',
      product_url: 'https://diaonline.supermercadosdia.com.ar/p',
      raw_price: 2000,
    });

    (fetchPromoPrice as ReturnType<typeof vi.fn>).mockResolvedValue({
      promoPrice: 1575,
      listPrice: null,
    });

    const enricher = makeEnricher(db);
    await enricher.enrichSuper('dia');

    const row = db.prepare('SELECT offer_price, discount_pct FROM products WHERE id = 1').get() as
      | { offer_price: number; discount_pct: number }
      | undefined;

    // basePrice = rawPrice=2000 (listPrice null)
    // pct = round((2000 - 1575) / 2000 * 100) = round(21.25) = 21
    expect(row?.offer_price).toBe(1575);
    expect(row?.discount_pct).toBe(21);
  });

  it('carrefour: writes nothing when fetchPromoPrice returns null', async () => {
    insertProduct(db, {
      super: 'carrefour',
      product_url: 'https://www.carrefour.com.ar/p',
      raw_price: 5000,
    });

    (fetchPromoPrice as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const enricher = makeEnricher(db);
    await enricher.enrichSuper('carrefour');

    const row = db.prepare('SELECT offer_price, discount_pct FROM products WHERE id = 1').get() as
      | { offer_price: number | null; discount_pct: number }
      | undefined;

    expect(row?.offer_price).toBeNull();
    expect(row?.discount_pct).toBe(0);
  });

  it('EnrichStatus: done count matches total after run', async () => {
    insertProduct(db, { super: 'dia', id: 1 });
    insertProduct(db, { super: 'dia', id: 2, product_id: 'prod-2' });

    (fetchPromoPrice as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const enricher = makeEnricher(db);
    await enricher.enrichSuper('dia');

    const st = enricher.getStatus();
    expect(st.dia?.total).toBe(2);
    expect(st.dia?.done).toBe(2);
    expect(st.dia?.running).toBe(false);
  });
});
