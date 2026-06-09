import type Database from 'better-sqlite3';
import type { Interest, ProductRow } from '../../../shared/types.js';

// ─── Row types from the JOIN query ───────────────────────────────────────────

interface InterestRow extends ProductRow {
  interest_id: number;
  added_at: string;
}

// ─── Row parser (mirrors interests.js parseRow) ───────────────────────────────

function tryParse(v: string | null): string[] {
  try {
    return JSON.parse(v ?? '[]') as string[];
  } catch {
    return [];
  }
}

function parseRow(p: InterestRow): Interest {
  const { interest_id, added_at, ...rest } = p;
  return {
    interest_id,
    added_at,
    ...rest,
    categories: tryParse(rest.categories),
    available: Boolean(rest.available),
  };
}

// ─── Repo factory ─────────────────────────────────────────────────────────────

export interface InterestsRepo {
  list(): Interest[];
  create(product_id: number): { id: number; product_id: number; already?: boolean };
  remove(id: number): { ok: boolean };
}

export function makeInterestsRepo(db: Database.Database): InterestsRepo {
  const listStmt = db.prepare<[], InterestRow>(`
    SELECT i.id as interest_id, i.added_at, p.*
    FROM interests i
    JOIN products p ON i.product_id = p.id
    ORDER BY i.added_at DESC
  `);

  const getProductStmt = db.prepare<[number], { id: number }>(
    'SELECT id FROM products WHERE id = ?',
  );

  const getExistingStmt = db.prepare<[number], { id: number }>(
    'SELECT id FROM interests WHERE product_id = ?',
  );

  const insertStmt = db.prepare<[number], { lastInsertRowid: bigint }>(
    'INSERT INTO interests (product_id) VALUES (?)',
  );

  const deleteStmt = db.prepare<[number], unknown>('DELETE FROM interests WHERE id = ?');

  return {
    list() {
      return listStmt.all().map(parseRow);
    },

    create(product_id) {
      const product = getProductStmt.get(product_id);
      if (!product) {
        throw Object.assign(new Error('Producto no encontrado'), { statusCode: 404 });
      }

      const existing = getExistingStmt.get(product_id);
      if (existing) {
        return { id: existing.id, product_id, already: true };
      }

      const result = insertStmt.run(product_id);
      return { id: Number(result.lastInsertRowid), product_id };
    },

    remove(id) {
      const result = deleteStmt.run(id) as { changes: number };
      if (!result.changes) {
        throw Object.assign(new Error('No encontrado'), { statusCode: 404 });
      }
      return { ok: true };
    },
  };
}
