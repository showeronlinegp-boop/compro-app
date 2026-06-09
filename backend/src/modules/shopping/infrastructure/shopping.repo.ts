import type Database from 'better-sqlite3';
import type { ProductRow, ShoppingItem } from '../../../shared/types.js';

// ─── Row type from the JOIN query ─────────────────────────────────────────────

interface ShoppingRow extends ProductRow {
  shopping_id: number;
  frequency_days: number;
  last_bought: string | null;
  notes: string | null;
  shopping_created_at: string;
}

// ─── Row parser (mirrors shopping.js parseRow) ────────────────────────────────

function tryParse(v: string | null): string[] {
  try {
    return JSON.parse(v ?? '[]') as string[];
  } catch {
    return [];
  }
}

function parseRow(p: ShoppingRow): ShoppingItem {
  const { shopping_id, frequency_days, last_bought, notes, shopping_created_at, ...rest } = p;
  return {
    shopping_id,
    frequency_days,
    last_bought,
    notes,
    shopping_created_at,
    ...rest,
    categories: tryParse(rest.categories),
    available: Boolean(rest.available),
  };
}

// ─── SQL fragment shared by list and listWeekly ───────────────────────────────

const WITH_PRODUCT = `
  SELECT s.id as shopping_id, s.frequency_days, s.last_bought, s.notes, s.created_at as shopping_created_at,
         p.*
  FROM shopping s
  JOIN products p ON s.product_id = p.id
`;

// ─── Repo interface ───────────────────────────────────────────────────────────

export interface WeeklyGroup {
  super: string;
  items: ShoppingItem[];
  total: number;
}

export interface ShoppingRepo {
  list(): ShoppingItem[];
  listWeekly(): WeeklyGroup[];
  create(data: {
    product_id: number;
    frequency_days?: number;
    notes?: string;
  }): { id: number; product_id: number; frequency_days: number; already?: boolean };
  update(
    id: number,
    data: { frequency_days?: number; last_bought?: string | null; notes?: string },
  ): { ok: boolean };
  remove(id: number): { ok: boolean };
}

// ─── Repo factory ─────────────────────────────────────────────────────────────

export function makeShoppingRepo(db: Database.Database): ShoppingRepo {
  const listStmt = db.prepare<[], ShoppingRow>(`${WITH_PRODUCT} ORDER BY p.name`);

  const listWeeklyStmt = db.prepare<[], ShoppingRow>(`
    ${WITH_PRODUCT}
    WHERE s.last_bought IS NULL
       OR (julianday('now') - julianday(s.last_bought)) >= s.frequency_days
    ORDER BY p.super, p.name
  `);

  const getProductStmt = db.prepare<[number], { id: number }>(
    'SELECT id FROM products WHERE id = ?',
  );

  const getExistingStmt = db.prepare<[number], { id: number }>(
    'SELECT id FROM shopping WHERE product_id = ?',
  );

  const insertStmt = db.prepare<[number, number, string], { lastInsertRowid: bigint }>(
    'INSERT INTO shopping (product_id, frequency_days, notes) VALUES (?,?,?)',
  );

  const getByIdStmt = db.prepare<[number], { id: number }>('SELECT id FROM shopping WHERE id = ?');

  const deleteStmt = db.prepare<[number], unknown>('DELETE FROM shopping WHERE id = ?');

  return {
    list() {
      return listStmt.all().map(parseRow);
    },

    listWeekly() {
      const rows = listWeeklyStmt.all().map(parseRow);
      const bySuper = new Map<string, WeeklyGroup>();

      for (const item of rows) {
        const superKey = item.super;
        if (!bySuper.has(superKey)) {
          bySuper.set(superKey, { super: superKey, items: [], total: 0 });
        }
        const group = bySuper.get(superKey);
        if (group) {
          group.items.push(item);
          const price = item.offer_price ?? item.raw_price ?? 0;
          group.total += price;
        }
      }

      return Array.from(bySuper.values());
    },

    create({ product_id, frequency_days = 7, notes = '' }) {
      const product = getProductStmt.get(product_id);
      if (!product) {
        throw Object.assign(new Error('Producto no encontrado'), { statusCode: 404 });
      }

      const existing = getExistingStmt.get(product_id);
      if (existing) {
        return { id: existing.id, product_id, frequency_days, already: true };
      }

      const result = insertStmt.run(product_id, frequency_days, notes);
      return { id: Number(result.lastInsertRowid), product_id, frequency_days };
    },

    update(id, data) {
      const item = getByIdStmt.get(id);
      if (!item) {
        throw Object.assign(new Error('No encontrado'), { statusCode: 404 });
      }

      const sets: string[] = [];
      const params: unknown[] = [];

      if (data.frequency_days != null) {
        sets.push('frequency_days = ?');
        params.push(data.frequency_days);
      }
      if (data.last_bought !== undefined) {
        sets.push('last_bought = ?');
        params.push(data.last_bought);
      }
      if (data.notes !== undefined) {
        sets.push('notes = ?');
        params.push(data.notes);
      }

      if (!sets.length) {
        throw Object.assign(new Error('Nada que actualizar'), { statusCode: 400 });
      }

      db.prepare(`UPDATE shopping SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
      return { ok: true };
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
