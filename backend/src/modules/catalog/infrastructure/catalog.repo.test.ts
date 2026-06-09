import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../../../infrastructure/db/migrations.js';
import { makeCatalogRepo } from './catalog.repo.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createTempDb(): Database.Database {
  const tmpFile = path.join(os.tmpdir(), `compro-catalog-test-${Date.now()}-${Math.random()}.db`);
  const db = new Database(tmpFile);
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

interface ProductSeed {
  super_key?: string;
  product_id?: string;
  name?: string;
  barcode?: string | null;
  categories?: string;
  available?: number;
  raw_price?: number;
  discount_pct?: number;
  offer_price?: number;
}

function seedProduct(db: Database.Database, overrides: ProductSeed = {}): number {
  const result = db
    .prepare(
      `INSERT INTO products (super, product_id, name, barcode, categories, available, raw_price, discount_pct, offer_price)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      overrides.super_key ?? 'vea',
      overrides.product_id ?? `pid-${Date.now()}-${Math.random()}`,
      overrides.name ?? 'Test Product',
      overrides.barcode ?? null,
      overrides.categories ?? '[]',
      overrides.available ?? 1,
      overrides.raw_price ?? null,
      overrides.discount_pct ?? 0,
      overrides.offer_price ?? null,
    );
  return Number(result.lastInsertRowid);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('makeCatalogRepo', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTempDb();
  });

  afterEach(() => {
    const filename = (db as Database.Database & { name?: string }).name;
    try {
      db.close();
    } catch {
      // ignore
    }
    if (filename) {
      try {
        fs.unlinkSync(filename);
      } catch {
        // ignore
      }
    }
  });

  describe('search', () => {
    it('returns empty result set when no products', () => {
      const repo = makeCatalogRepo(db);
      const result = repo.search({});
      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
      expect(result.pages).toBe(0);
    });

    it('returns all products with no filters', () => {
      seedProduct(db, { name: 'Leche' });
      seedProduct(db, { name: 'Pan' });
      const repo = makeCatalogRepo(db);
      const result = repo.search({});
      expect(result.total).toBe(2);
      expect(result.data).toHaveLength(2);
    });

    it('parseRow: available is boolean, categories is array', () => {
      seedProduct(db, {
        name: 'Yogur',
        available: 1,
        categories: JSON.stringify(['Lácteos', 'Yogur']),
      });
      const repo = makeCatalogRepo(db);
      const result = repo.search({});
      const item = result.data[0];
      expect(item?.available).toBe(true);
      expect(Array.isArray(item?.categories)).toBe(true);
      expect(item?.categories).toEqual(['Lácteos', 'Yogur']);
    });

    it('filters by q (name LIKE)', () => {
      seedProduct(db, { name: 'Leche entera' });
      seedProduct(db, { name: 'Pan integral' });
      const repo = makeCatalogRepo(db);
      const result = repo.search({ q: 'leche' });
      expect(result.total).toBe(1);
      expect(result.data[0]?.name).toBe('Leche entera');
    });

    it('filters by super', () => {
      seedProduct(db, { super_key: 'vea', product_id: 'pv', name: 'VeaProduct' });
      seedProduct(db, { super_key: 'carrefour', product_id: 'pc', name: 'CarreProduct' });
      const repo = makeCatalogRepo(db);
      const result = repo.search({ super: 'vea' });
      expect(result.total).toBe(1);
      expect(result.data[0]?.super).toBe('vea');
    });

    it('filters by category via vtexStrings', () => {
      seedProduct(db, {
        name: 'Leche',
        categories: JSON.stringify(['Lácteos']),
      });
      seedProduct(db, {
        name: 'Pan',
        categories: JSON.stringify(['Panaderia']),
      });
      const repo = makeCatalogRepo(db);
      const result = repo.search({ category: 'lacteos', vtexStrings: ['Lácteos'] });
      expect(result.total).toBe(1);
      expect(result.data[0]?.name).toBe('Leche');
    });

    it('filters by discount=1', () => {
      seedProduct(db, { name: 'OnSale', discount_pct: 20 });
      seedProduct(db, { name: 'Normal', discount_pct: 0 });
      const repo = makeCatalogRepo(db);
      const result = repo.search({ discount: '1' });
      expect(result.total).toBe(1);
      expect(result.data[0]?.name).toBe('OnSale');
    });

    it('filters by available=1', () => {
      seedProduct(db, { name: 'Available', available: 1 });
      seedProduct(db, { name: 'Unavailable', available: 0 });
      const repo = makeCatalogRepo(db);
      const result = repo.search({ available: '1' });
      expect(result.total).toBe(1);
      expect(result.data[0]?.name).toBe('Available');
    });

    it('paginates correctly', () => {
      for (let i = 1; i <= 5; i++) {
        seedProduct(db, { product_id: `p${i}`, name: `Product ${i}` });
      }
      const repo = makeCatalogRepo(db);
      const page1 = repo.search({ limit: '2', page: '1' });
      const page2 = repo.search({ limit: '2', page: '2' });
      expect(page1.data).toHaveLength(2);
      expect(page1.total).toBe(5);
      expect(page1.pages).toBe(3);
      expect(page2.data).toHaveLength(2);
      expect(page2.page).toBe(2);
    });
  });

  describe('getGroups', () => {
    it('returns empty when no barcoded products', () => {
      seedProduct(db, { name: 'NoBarcodeProduct' });
      const repo = makeCatalogRepo(db);
      const result = repo.getGroups({});
      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('deduplicates by barcode across supers', () => {
      // Same barcode in 2 different supers
      seedProduct(db, {
        super_key: 'vea',
        product_id: 'v1',
        name: 'Leche Entera 1L',
        barcode: 'BC123',
        raw_price: 100,
        available: 1,
      });
      seedProduct(db, {
        super_key: 'carrefour',
        product_id: 'c1',
        name: 'Leche Entera 1L',
        barcode: 'BC123',
        raw_price: 90,
        available: 1,
      });
      const repo = makeCatalogRepo(db);
      const result = repo.getGroups({});
      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
      const group = result.data[0];
      expect(group?.barcode).toBe('BC123');
      expect(group?.super_count).toBe(2);
      expect(group?.variants).toHaveLength(2);
      // Variants should be sorted by raw_price ASC
      expect(group?.variants[0]?.raw_price).toBe(90);
      expect(group?.variants[1]?.raw_price).toBe(100);
    });

    it('excludes barcodes present in only one super', () => {
      seedProduct(db, {
        super_key: 'vea',
        product_id: 'only1',
        name: 'Single Super Product',
        barcode: 'BC_SINGLE',
        available: 1,
      });
      const repo = makeCatalogRepo(db);
      const result = repo.getGroups({});
      expect(result.data).toHaveLength(0);
    });

    it('excludes unavailable products', () => {
      // One available, one unavailable — same barcode, same super would be 1 super count
      // To test exclusion: two supers but one is unavailable
      seedProduct(db, {
        super_key: 'vea',
        product_id: 'va',
        barcode: 'BC_AVAIL',
        available: 1,
      });
      seedProduct(db, {
        super_key: 'carrefour',
        product_id: 'ca',
        barcode: 'BC_AVAIL',
        available: 0,
      });
      const repo = makeCatalogRepo(db);
      const result = repo.getGroups({});
      // Only 1 available super → not eligible (needs 2+)
      expect(result.data).toHaveLength(0);
    });

    it('paginates groups correctly', () => {
      // Create 4 distinct barcodes each with 2 supers
      for (let i = 1; i <= 4; i++) {
        seedProduct(db, {
          super_key: 'vea',
          product_id: `v${i}`,
          name: `Product ${i}`,
          barcode: `BC${i}`,
          available: 1,
        });
        seedProduct(db, {
          super_key: 'carrefour',
          product_id: `c${i}`,
          name: `Product ${i}`,
          barcode: `BC${i}`,
          available: 1,
        });
      }
      const repo = makeCatalogRepo(db);
      const page1 = repo.getGroups({ limit: '2', page: '1' });
      expect(page1.total).toBe(4);
      expect(page1.data).toHaveLength(2);
      expect(page1.pages).toBe(2);
    });
  });

  describe('getCategories', () => {
    it('returns empty array (taxonomy injected at route layer, not repo)', () => {
      const repo = makeCatalogRepo(db);
      // The repo.getCategories() returns [] by design — categories come from taxonomy dep
      expect(repo.getCategories()).toEqual([]);
    });
  });
});
