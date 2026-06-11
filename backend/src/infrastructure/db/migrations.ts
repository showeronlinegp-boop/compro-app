import type Database from 'better-sqlite3';

/**
 * Idempotent migrations: CREATE TABLE IF NOT EXISTS + ALTER TABLE for missing columns.
 * Mirrors the logic in db.js exactly — no schema changes.
 */
export function runMigrations(db: Database.Database): void {
  // ── Core tables ────────────────────────────────────────────────────────────

  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id           INTEGER PRIMARY KEY,
      super        TEXT    NOT NULL,
      product_id   TEXT    NOT NULL,
      name         TEXT    NOT NULL,
      barcode      TEXT,
      image_url    TEXT,
      product_url  TEXT,
      raw_price    REAL,
      offer_price  REAL,
      discount_pct INTEGER DEFAULT 0,
      available    INTEGER DEFAULT 1,
      categories   TEXT,
      promotions   TEXT,
      synced_at    TEXT    DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(super, product_id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS interests (
      id         INTEGER PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      added_at   TEXT    DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS shopping (
      id             INTEGER PRIMARY KEY,
      product_id     INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      frequency_days INTEGER NOT NULL DEFAULT 7,
      last_bought    TEXT,
      notes          TEXT,
      created_at     TEXT    DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_log (
      id            INTEGER PRIMARY KEY,
      super         TEXT    NOT NULL,
      started_at    TEXT,
      finished_at   TEXT,
      product_count INTEGER,
      status        TEXT    DEFAULT 'pending',
      error         TEXT,
      progress_leaf INTEGER DEFAULT 0,
      total_leaves  INTEGER DEFAULT 0
    )
  `);

  // ── Idempotent column additions for existing DBs ───────────────────────────

  interface ColInfo {
    name: string;
  }

  const syncCols = (db.pragma('table_info(sync_log)') as ColInfo[]).map((r) => r.name);
  if (!syncCols.includes('progress_leaf')) {
    db.exec('ALTER TABLE sync_log ADD COLUMN progress_leaf INTEGER DEFAULT 0');
  }
  if (!syncCols.includes('total_leaves')) {
    db.exec('ALTER TABLE sync_log ADD COLUMN total_leaves INTEGER DEFAULT 0');
  }

  const prodCols = (db.pragma('table_info(products)') as ColInfo[]).map((r) => r.name);
  if (!prodCols.includes('sku_id')) {
    db.exec('ALTER TABLE products ADD COLUMN sku_id TEXT');
  }
  if (!prodCols.includes('promotions')) {
    db.exec('ALTER TABLE products ADD COLUMN promotions TEXT');
  }
}
