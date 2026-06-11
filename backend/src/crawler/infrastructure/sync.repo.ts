/**
 * sync.repo.ts — Database operations for the crawler sync workflow.
 *
 * Port of the DB interactions from backend/crawler-service.js.
 * Uses better-sqlite3 spread params (positional, not array form).
 * SQL and sync_log columns match legacy EXACTLY.
 */

import type Database from 'better-sqlite3';
import type { NormalizedCrawlItem, SyncLog } from '../../shared/types.js';

export interface SyncRepo {
  /** Upsert a batch of products for a given superKey (wrapped in a transaction). */
  upsertProducts: (superKey: string, items: NormalizedCrawlItem[]) => void;
  /** Delete rows for superKey that were last synced before the given sync started_at. */
  deleteStaleForSuper: (superKey: string, logId: number) => number;
  /** Insert a new sync_log row and return its rowid. */
  insertSyncLog: (superKey: string) => number;
  /** Update progress fields on an existing sync_log row. */
  updateSyncProgress: (
    progressLeaf: number,
    totalLeaves: number,
    productCount: number,
    logId: number,
  ) => void;
  /** Mark a sync_log row as completed (ok). */
  finishSyncLog: (productCount: number, logId: number) => void;
  /** Mark a sync_log row as failed (error). */
  failSyncLog: (errorMessage: string, logId: number) => void;
  /** Return the latest sync_log row per super, ordered by super. */
  getSyncStatus: () => SyncLog[];
}

export function makeSyncRepo(db: Database.Database): SyncRepo {
  const upsertStmt = db.prepare<
    [
      string, // super
      string, // product_id
      string | null, // sku_id
      string, // name
      string | null, // barcode
      string | null, // image_url
      string, // product_url
      number | null, // raw_price
      number | null, // offer_price
      number, // discount_pct
      number, // available (0/1)
      string, // categories (JSON)
      string, // promotions (JSON)
    ]
  >(`
    INSERT INTO products
      (super, product_id, sku_id, name, barcode, image_url, product_url,
       raw_price, offer_price, discount_pct, available, categories, promotions, synced_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(super, product_id) DO UPDATE SET
      sku_id       = excluded.sku_id,
      name         = excluded.name,
      raw_price    = excluded.raw_price,
      offer_price  = excluded.offer_price,
      discount_pct = excluded.discount_pct,
      available    = excluded.available,
      categories   = excluded.categories,
      promotions   = excluded.promotions,
      synced_at    = excluded.synced_at
  `);

  const upsertTx = db.transaction((superKey: string, items: NormalizedCrawlItem[]) => {
    for (const p of items) {
      upsertStmt.run(
        superKey,
        p.product_id,
        p.sku_id ?? null,
        p.name,
        p.barcode ?? null,
        p.image_url ?? null,
        p.product_url,
        p.raw_price ?? null,
        p.offer_price ?? null,
        p.discount_pct,
        p.available ? 1 : 0,
        JSON.stringify(p.category_paths),
        JSON.stringify(p.promotions),
      );
    }
  });

  const deleteStaleStmt = db.prepare<[string, number]>(`
    DELETE FROM products
    WHERE super = ? AND synced_at < (SELECT started_at FROM sync_log WHERE id = ?)
  `);

  const insertLogStmt = db.prepare<[string]>(`
    INSERT INTO sync_log (super, started_at, status, progress_leaf, total_leaves)
    VALUES (?, datetime('now'), 'running', 0, 0)
  `);

  const updateProgressStmt = db.prepare<[number, number, number, number]>(`
    UPDATE sync_log SET progress_leaf=?, total_leaves=?, product_count=? WHERE id=?
  `);

  const finishLogStmt = db.prepare<[number, number]>(`
    UPDATE sync_log
    SET finished_at=datetime('now'), product_count=?, status='ok', progress_leaf=total_leaves
    WHERE id=?
  `);

  const failLogStmt = db.prepare<[string, number]>(`
    UPDATE sync_log SET finished_at=datetime('now'), status='error', error=? WHERE id=?
  `);

  const statusStmt = db.prepare<[]>(`
    SELECT super, started_at, finished_at, product_count, status, error,
           progress_leaf, total_leaves
    FROM sync_log
    WHERE id IN (SELECT MAX(id) FROM sync_log GROUP BY super)
    ORDER BY super
  `);

  return {
    upsertProducts(superKey, items) {
      upsertTx(superKey, items);
    },

    deleteStaleForSuper(superKey, logId) {
      const result = deleteStaleStmt.run(superKey, logId);
      return result.changes;
    },

    insertSyncLog(superKey) {
      const result = insertLogStmt.run(superKey);
      return Number(result.lastInsertRowid);
    },

    updateSyncProgress(progressLeaf, totalLeaves, productCount, logId) {
      updateProgressStmt.run(progressLeaf, totalLeaves, productCount, logId);
    },

    finishSyncLog(productCount, logId) {
      finishLogStmt.run(productCount, logId);
    },

    failSyncLog(errorMessage, logId) {
      failLogStmt.run(errorMessage, logId);
    },

    getSyncStatus() {
      return statusStmt.all() as SyncLog[];
    },
  };
}
