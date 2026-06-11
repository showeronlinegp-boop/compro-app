import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../../../infrastructure/db/migrations.js';
import { makeShoppingRepo } from './shopping.repo.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createTempDb(): Database.Database {
  const tmpFile = path.join(os.tmpdir(), `compro-shopping-test-${Date.now()}-${Math.random()}.db`);
  const db = new Database(tmpFile);
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

function seedProduct(
  db: Database.Database,
  overrides: Partial<{ super_key: string; product_id: string; name: string }> = {},
): number {
  const result = db
    .prepare(
      `INSERT INTO products (super, product_id, name, available, categories)
       VALUES (?, ?, ?, 1, '[]')`,
    )
    .run(
      overrides.super_key ?? 'vea',
      overrides.product_id ?? `pid-${Date.now()}-${Math.random()}`,
      overrides.name ?? 'Test Product',
    );
  return Number(result.lastInsertRowid);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('makeShoppingRepo', () => {
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

  describe('create → list → update → remove round-trip', () => {
    it('creates a shopping item, lists it, then removes it', () => {
      const productId = seedProduct(db);
      const repo = makeShoppingRepo(db);

      // create
      const created = repo.create({ product_id: productId });
      expect(created.id).toBeTypeOf('number');
      expect(created.product_id).toBe(productId);
      expect(created.already).toBeUndefined();
      expect(created.frequency_days).toBe(7);

      // list
      const items = repo.list();
      expect(items).toHaveLength(1);
      const item = items[0];
      expect(item).toBeDefined();
      expect(item?.shopping_id).toBe(created.id);
      expect(item?.name).toBe('Test Product');
      expect(item?.available).toBe(true);
      expect(Array.isArray(item?.categories)).toBe(true);
      expect(item?.frequency_days).toBe(7);

      // update frequency_days
      const updated = repo.update(created.id, { frequency_days: 14 });
      expect(updated.ok).toBe(true);

      const afterUpdate = repo.list();
      expect(afterUpdate[0]?.frequency_days).toBe(14);

      // remove
      const removed = repo.remove(created.id);
      expect(removed.ok).toBe(true);

      // list again — should be empty
      expect(repo.list()).toHaveLength(0);
    });

    it('returns already:true when item already exists in shopping list', () => {
      const productId = seedProduct(db);
      const repo = makeShoppingRepo(db);

      const first = repo.create({ product_id: productId });
      const second = repo.create({ product_id: productId });

      expect(second.already).toBe(true);
      expect(second.id).toBe(first.id);
    });

    it('respects custom frequency_days and notes on create', () => {
      const productId = seedProduct(db);
      const repo = makeShoppingRepo(db);

      const created = repo.create({ product_id: productId, frequency_days: 30, notes: 'extra' });
      expect(created.frequency_days).toBe(30);

      const items = repo.list();
      expect(items[0]?.notes).toBe('extra');
    });

    it('update sets last_bought', () => {
      const productId = seedProduct(db);
      const repo = makeShoppingRepo(db);
      const created = repo.create({ product_id: productId });

      repo.update(created.id, { last_bought: '2024-01-15' });

      const items = repo.list();
      expect(items[0]?.last_bought).toBe('2024-01-15');
    });
  });

  describe('listWeekly', () => {
    it('returns only due items (last_bought IS NULL counts as due)', () => {
      const p1 = seedProduct(db, { product_id: 'p1', name: 'Milk', super_key: 'vea' });
      const p2 = seedProduct(db, { product_id: 'p2', name: 'Bread', super_key: 'vea' });
      const repo = makeShoppingRepo(db);

      // p1: last_bought = NULL → always due
      repo.create({ product_id: p1, frequency_days: 7 });

      // p2: last_bought far in past → due
      const created2 = repo.create({ product_id: p2, frequency_days: 3 });
      repo.update(created2.id, { last_bought: '2020-01-01' });

      const weekly = repo.listWeekly();
      // Both should appear
      const allItems = weekly.flatMap((g) => g.items);
      const ids = allItems.map((i) => i.product_id);
      expect(ids).toContain('p1');
      expect(ids).toContain('p2');
    });

    it('excludes items bought recently (not yet due)', () => {
      const p1 = seedProduct(db, { product_id: 'pRecent', name: 'Fresh', super_key: 'vea' });
      const repo = makeShoppingRepo(db);

      const created = repo.create({ product_id: p1, frequency_days: 365 });
      // Set last_bought to today (not due for another year)
      const today = new Date().toISOString().slice(0, 10);
      repo.update(created.id, { last_bought: today });

      const weekly = repo.listWeekly();
      const allItems = weekly.flatMap((g) => g.items);
      expect(allItems.map((i) => i.product_id)).not.toContain('pRecent');
    });

    it('groups results by super and sums price', () => {
      const pVea = seedProduct(db, { product_id: 'pv1', super_key: 'vea' });
      const pCarre = seedProduct(db, { product_id: 'pc1', super_key: 'carrefour' });
      db.prepare('UPDATE products SET raw_price = ? WHERE id = ?').run(100, pVea);
      db.prepare('UPDATE products SET raw_price = ? WHERE id = ?').run(200, pCarre);

      const repo = makeShoppingRepo(db);
      repo.create({ product_id: pVea });
      repo.create({ product_id: pCarre });

      const weekly = repo.listWeekly();
      expect(weekly.length).toBe(2);

      const veaGroup = weekly.find((g) => g.super === 'vea');
      const carreGroup = weekly.find((g) => g.super === 'carrefour');
      expect(veaGroup?.items).toHaveLength(1);
      expect(veaGroup?.total).toBe(100);
      expect(carreGroup?.items).toHaveLength(1);
      expect(carreGroup?.total).toBe(200);
    });
  });

  describe('error cases', () => {
    it('throws 404 when creating for non-existent product', () => {
      const repo = makeShoppingRepo(db);
      expect(() => repo.create({ product_id: 99999 })).toThrow('Producto no encontrado');
    });

    it('throws 404 when updating non-existent item', () => {
      const repo = makeShoppingRepo(db);
      expect(() => repo.update(99999, { frequency_days: 7 })).toThrow('No encontrado');
    });

    it('throws 400 when updating with no fields', () => {
      const productId = seedProduct(db);
      const repo = makeShoppingRepo(db);
      const created = repo.create({ product_id: productId });
      expect(() => repo.update(created.id, {})).toThrow('Nada que actualizar');
    });

    it('throws 404 when removing non-existent item', () => {
      const repo = makeShoppingRepo(db);
      expect(() => repo.remove(99999)).toThrow('No encontrado');
    });
  });

  describe('parsed row shape', () => {
    it('categories is parsed from JSON string to array', () => {
      const productId = seedProduct(db);
      db.prepare('UPDATE products SET categories = ? WHERE id = ?').run(
        JSON.stringify(['Lácteos', 'Yogur']),
        productId,
      );
      const repo = makeShoppingRepo(db);
      repo.create({ product_id: productId });

      const [item] = repo.list();
      expect(item?.categories).toEqual(['Lácteos', 'Yogur']);
    });

    it('available is coerced from 0/1 to boolean', () => {
      const productId = seedProduct(db);
      db.prepare('UPDATE products SET available = 0 WHERE id = ?').run(productId);
      const repo = makeShoppingRepo(db);
      repo.create({ product_id: productId });

      const [item] = repo.list();
      expect(item?.available).toBe(false);
    });
  });
});
