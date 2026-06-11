import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../../../infrastructure/db/migrations.js';
import { makeInterestsRepo } from './interests.repo.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createTempDb(): Database.Database {
  const tmpFile = path.join(os.tmpdir(), `compro-test-${Date.now()}-${Math.random()}.db`);
  const db = new Database(tmpFile);
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

function seedProduct(
  db: Database.Database,
  overrides: Partial<{
    super_key: string;
    product_id: string;
    name: string;
  }> = {},
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

describe('makeInterestsRepo', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTempDb();
  });

  afterEach(() => {
    // Close DB and clean up temp file
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

  describe('create → list → remove round-trip', () => {
    it('creates an interest, lists it, then removes it', () => {
      const productId = seedProduct(db);
      const repo = makeInterestsRepo(db);

      // create
      const created = repo.create(productId);
      expect(created.id).toBeTypeOf('number');
      expect(created.product_id).toBe(productId);
      expect(created.already).toBeUndefined();

      // list
      const interests = repo.list();
      expect(interests).toHaveLength(1);
      const interest = interests[0];
      expect(interest).toBeDefined();
      expect(interest?.interest_id).toBe(created.id);
      expect(interest?.name).toBe('Test Product');
      expect(interest?.available).toBe(true);
      expect(Array.isArray(interest?.categories)).toBe(true);

      // remove
      const removed = repo.remove(created.id);
      expect(removed.ok).toBe(true);

      // list again — should be empty
      expect(repo.list()).toHaveLength(0);
    });

    it('returns already:true when interest already exists', () => {
      const productId = seedProduct(db);
      const repo = makeInterestsRepo(db);

      const first = repo.create(productId);
      const second = repo.create(productId);

      expect(second.already).toBe(true);
      expect(second.id).toBe(first.id);
    });

    it('list returns interests ordered by added_at DESC', () => {
      const p1 = seedProduct(db, { product_id: 'p1' });
      const p2 = seedProduct(db, { product_id: 'p2' });
      const repo = makeInterestsRepo(db);

      // Insert p1 with an explicit earlier timestamp, p2 with a later one
      // so the ordering test is deterministic regardless of wall-clock resolution.
      db.prepare(
        `INSERT INTO interests (product_id, added_at) VALUES (?, datetime('now', '-1 second'))`,
      ).run(p1);
      db.prepare(`INSERT INTO interests (product_id, added_at) VALUES (?, datetime('now'))`).run(
        p2,
      );

      const list = repo.list();
      expect(list).toHaveLength(2);
      // p2 was added later, should be first (DESC order)
      expect(list[0]?.product_id).toBe('p2');
      expect(list[1]?.product_id).toBe('p1');
    });
  });

  describe('error cases', () => {
    it('throws 404 when creating interest for non-existent product', () => {
      const repo = makeInterestsRepo(db);
      expect(() => repo.create(99999)).toThrow('Producto no encontrado');
    });

    it('throws 404 with statusCode when creating interest for non-existent product', () => {
      const repo = makeInterestsRepo(db);
      try {
        repo.create(99999);
        expect.fail('should have thrown');
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        expect(e.statusCode).toBe(404);
      }
    });

    it('throws 404 when removing non-existent interest', () => {
      const repo = makeInterestsRepo(db);
      expect(() => repo.remove(99999)).toThrow('No encontrado');
    });

    it('throws 404 with statusCode when removing non-existent interest', () => {
      const repo = makeInterestsRepo(db);
      try {
        repo.remove(99999);
        expect.fail('should have thrown');
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        expect(e.statusCode).toBe(404);
      }
    });

    it('FK violation: inserting interest with deleted product throws', () => {
      const productId = seedProduct(db);
      const repo = makeInterestsRepo(db);

      // Create interest successfully
      const created = repo.create(productId);
      expect(created.id).toBeTypeOf('number');

      // Delete the product — CASCADE should remove the interest
      db.prepare('DELETE FROM products WHERE id = ?').run(productId);

      // Interest should be gone via CASCADE
      expect(repo.list()).toHaveLength(0);

      // Attempting to create an interest for a now-deleted product fails
      expect(() => repo.create(productId)).toThrow('Producto no encontrado');
    });

    it('FK violation: direct INSERT without matching product_id throws SQLite FOREIGN KEY error', () => {
      // This tests the DB-level FK constraint directly (not via repo)
      expect(() => {
        db.prepare('INSERT INTO interests (product_id) VALUES (?)').run(9999);
      }).toThrow();
    });
  });

  describe('list returns parsed row shape', () => {
    it('categories is parsed from JSON string to array', () => {
      const productId = seedProduct(db);
      db.prepare('UPDATE products SET categories = ? WHERE id = ?').run(
        JSON.stringify(['Lácteos', 'Yogur']),
        productId,
      );
      const repo = makeInterestsRepo(db);
      repo.create(productId);

      const [interest] = repo.list();
      expect(interest?.categories).toEqual(['Lácteos', 'Yogur']);
    });

    it('available is coerced from 0/1 to boolean', () => {
      const productId = seedProduct(db);
      db.prepare('UPDATE products SET available = 0 WHERE id = ?').run(productId);
      const repo = makeInterestsRepo(db);
      repo.create(productId);

      const [interest] = repo.list();
      expect(interest?.available).toBe(false);
    });
  });
});
