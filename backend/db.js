'use strict';

const Database = require('better-sqlite3');
const path     = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'compro.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec('CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, super TEXT NOT NULL, product_id TEXT NOT NULL, name TEXT NOT NULL, barcode TEXT, image_url TEXT, product_url TEXT, raw_price REAL, offer_price REAL, discount_pct INTEGER DEFAULT 0, available INTEGER DEFAULT 1, categories TEXT, synced_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(super, product_id))');
db.exec('CREATE TABLE IF NOT EXISTS interests (id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, added_at TEXT DEFAULT CURRENT_TIMESTAMP)');
db.exec('CREATE TABLE IF NOT EXISTS shopping (id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, frequency_days INTEGER NOT NULL DEFAULT 7, last_bought TEXT, notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)');
db.exec('CREATE TABLE IF NOT EXISTS sync_log (id INTEGER PRIMARY KEY, super TEXT NOT NULL, started_at TEXT, finished_at TEXT, product_count INTEGER, status TEXT DEFAULT \'pending\', error TEXT, progress_leaf INTEGER DEFAULT 0, total_leaves INTEGER DEFAULT 0)');

// Migrations para DBs existentes
const syncCols = db.pragma('table_info(sync_log)').map(r => r.name);
if (!syncCols.includes('progress_leaf')) db.exec('ALTER TABLE sync_log ADD COLUMN progress_leaf INTEGER DEFAULT 0');
if (!syncCols.includes('total_leaves'))  db.exec('ALTER TABLE sync_log ADD COLUMN total_leaves  INTEGER DEFAULT 0');

const prodCols = db.pragma('table_info(products)').map(r => r.name);
if (!prodCols.includes('sku_id')) db.exec('ALTER TABLE products ADD COLUMN sku_id TEXT');

function closeDb() {
  try { db.close(); } catch { /* ignore */ }
}
process.on('exit',    closeDb);
process.on('SIGINT',  () => { closeDb(); process.exit(0); });
process.on('SIGTERM', () => { closeDb(); process.exit(0); });

module.exports = db;
