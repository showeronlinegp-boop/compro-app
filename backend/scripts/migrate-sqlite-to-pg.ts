/**
 * migrate-sqlite-to-pg.ts — One-shot ETL: SQLite → PostgreSQL via Prisma.
 *
 * Reads compro.db (via better-sqlite3, devDependency), writes to Postgres
 * (via Prisma createMany). Idempotent: re-running with --force truncates
 * all tables first. Without --force it aborts if data already exists.
 *
 * Load order (FK-safe): products → interests → shopping → sync_log → promo_offers
 *
 * After load, sequences are reset so future inserts don't collide with migrated IDs.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx tsx scripts/migrate-sqlite-to-pg.ts
 *   DATABASE_URL="postgresql://..." npx tsx scripts/migrate-sqlite-to-pg.ts --force
 *   npm run migrate:etl              (uses DATABASE_URL from env)
 *
 * Type coercions applied:
 *   - available: INTEGER 0/1 → Boolean
 *   - categories/promotions: TEXT JSON string → parsed object (jsonb)
 *   - synced_at / *_at: TEXT UTC naive → Date (append 'Z')
 *   - interest_free: INTEGER 0/1/null → boolean|null
 *   - captured_at: INTEGER (Unix ms) → BigInt
 */

import 'dotenv/config';
import Database from 'better-sqlite3';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CHUNK_SIZE = 1000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQLITE_PATH = path.resolve(__dirname, '../../compro.db');

const _rawConnectionString = process.env.DATABASE_URL;
if (!_rawConnectionString) {
  throw new Error(
    '[migrate-sqlite-to-pg] DATABASE_URL is required — set it in backend/.env (see .env.example)',
  );
}
const connectionString: string = _rawConnectionString;

// ---------------------------------------------------------------------------
// SQLite row types (raw, before coercion)
// ---------------------------------------------------------------------------

interface SqliteProduct {
  id: number;
  super: string;
  product_id: string;
  sku_id: string | null;
  name: string;
  barcode: string | null;
  image_url: string | null;
  product_url: string | null;
  raw_price: number | null;
  offer_price: number | null;
  discount_pct: number;
  available: number; // INTEGER 0/1
  categories: string | null; // TEXT JSON
  promotions: string | null; // TEXT JSON
  synced_at: string; // TEXT UTC naive
}

interface SqliteInterest {
  id: number;
  product_id: number;
  added_at: string; // TEXT UTC naive
}

interface SqliteShopping {
  id: number;
  product_id: number;
  frequency_days: number;
  last_bought: string | null; // TEXT UTC naive | null
  notes: string | null;
  created_at: string; // TEXT UTC naive
}

interface SqliteSyncLog {
  id: number;
  super: string;
  started_at: string | null;
  finished_at: string | null;
  product_count: number | null;
  status: string;
  error: string | null;
  progress_leaf: number;
  total_leaves: number;
}

interface SqlitePromoOffer {
  id: number;
  super: string;
  bank: string | null;
  title: string | null;
  description: string | null;
  discount_pct: number | null;
  installments: number | null;
  interest_free: number | null; // INTEGER 0/1/null
  logo_url: string | null;
  image_url: string | null;
  validity: string | null;
  source_url: string;
  captured_at: number; // Unix ms INTEGER
}

// ---------------------------------------------------------------------------
// Type coercions
// ---------------------------------------------------------------------------

/** Parse TEXT UTC naive datetime from SQLite → Date. */
function parseDateTime(s: string | null): Date | null {
  if (s == null || s.trim() === '') return null;
  // SQLite stores "YYYY-MM-DD HH:MM:SS" without TZ — treat as UTC
  return new Date(s.endsWith('Z') ? s : s + 'Z');
}

/** Safely parse a JSON string; returns null on malformed input. */
function tryParseJson(s: string | null): unknown {
  if (s == null || s.trim() === '') return null;
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return null;
  }
}

/** Chunk an array into sub-arrays of at most `size` elements. */
function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Prisma client setup
// ---------------------------------------------------------------------------

function makePrisma(): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter, log: ['warn', 'error'] });
}

// ---------------------------------------------------------------------------
// Idempotency guard + truncation
// ---------------------------------------------------------------------------

async function checkIdempotency(prisma: PrismaClient, force: boolean): Promise<void> {
  const count = await prisma.products.count();
  if (count === 0) return; // empty — safe to proceed

  if (!force) {
    console.error(
      `[ETL] ERROR: products table already has ${count} rows. ` +
        `Re-run with --force to truncate all tables and reload.`,
    );
    process.exit(1);
  }

  console.log(`[ETL] --force flag set. Truncating all tables (${count} existing products)...`);
  // Delete in FK-safe order (children before parents).
  // Use DELETE (row-level lock) instead of TRUNCATE (ACCESS EXCLUSIVE) to
  // avoid lock conflicts with concurrent connections.
  await prisma.$transaction([
    prisma.$executeRaw`DELETE FROM shopping`,
    prisma.$executeRaw`DELETE FROM interests`,
    prisma.$executeRaw`DELETE FROM promo_offers`,
    prisma.$executeRaw`DELETE FROM sync_log`,
    prisma.$executeRaw`DELETE FROM products`,
    // Reset sequences so IDs restart from 1
    prisma.$executeRaw`SELECT setval(pg_get_serial_sequence('products', 'id'), 1, false)`,
    prisma.$executeRaw`SELECT setval(pg_get_serial_sequence('interests', 'id'), 1, false)`,
    prisma.$executeRaw`SELECT setval(pg_get_serial_sequence('shopping', 'id'), 1, false)`,
    prisma.$executeRaw`SELECT setval(pg_get_serial_sequence('sync_log', 'id'), 1, false)`,
    prisma.$executeRaw`SELECT setval(pg_get_serial_sequence('promo_offers', 'id'), 1, false)`,
  ]);
  console.log('[ETL] All tables truncated. Sequences reset to 1.');
}

// ---------------------------------------------------------------------------
// Row-count validation
// ---------------------------------------------------------------------------

interface CountReport {
  table: string;
  source: number;
  destination: number;
  match: boolean;
}

async function validateCounts(
  prisma: PrismaClient,
  expected: Record<string, number>,
): Promise<CountReport[]> {
  const reports: CountReport[] = [];

  const pgCounts: Record<string, number> = {
    products: await prisma.products.count(),
    interests: await prisma.interests.count(),
    shopping: await prisma.shopping.count(),
    sync_log: await prisma.sync_log.count(),
    promo_offers: await prisma.promo_offers.count(),
  };

  for (const [table, src] of Object.entries(expected)) {
    const dst = pgCounts[table] ?? 0;
    reports.push({ table, source: src, destination: dst, match: src === dst });
  }

  return reports;
}

// ---------------------------------------------------------------------------
// Spot-check assertions
// ---------------------------------------------------------------------------

async function spotCheck(
  prisma: PrismaClient,
  sqlite: Database.Database,
): Promise<{ passed: boolean; details: string[] }> {
  const details: string[] = [];
  let passed = true;

  // Pick 3 random product IDs from SQLite and verify name + discount_pct + available
  const samples = sqlite
    .prepare('SELECT id, name, discount_pct, available FROM products ORDER BY RANDOM() LIMIT 3')
    .all() as Array<{ id: number; name: string; discount_pct: number; available: number }>;

  for (const sample of samples) {
    const pg = await prisma.products.findUnique({ where: { id: sample.id } });
    if (!pg) {
      details.push(`FAIL: product id=${sample.id} not found in Postgres`);
      passed = false;
      continue;
    }
    if (pg.name !== sample.name) {
      details.push(`FAIL: product id=${sample.id} name mismatch: "${pg.name}" vs "${sample.name}"`);
      passed = false;
    } else if (pg.discount_pct !== sample.discount_pct) {
      details.push(
        `FAIL: product id=${sample.id} discount_pct mismatch: ${pg.discount_pct} vs ${sample.discount_pct}`,
      );
      passed = false;
    } else if (pg.available !== (sample.available === 1)) {
      details.push(
        `FAIL: product id=${sample.id} available mismatch: ${String(pg.available)} vs ${String(sample.available === 1)}`,
      );
      passed = false;
    } else {
      details.push(`OK: product id=${sample.id} "${pg.name}" — spot check passed`);
    }
  }

  return { passed, details };
}

// ---------------------------------------------------------------------------
// Reset sequences after load
// ---------------------------------------------------------------------------

async function resetSequences(prisma: PrismaClient): Promise<void> {
  // Set each sequence to the current MAX(id) so next insert gets MAX+1.
  // GREATEST(..., 1) guards against empty tables (setval rejects 0).
  // Third arg omitted (defaults to true) — "this value is already used".
  await prisma.$transaction([
    prisma.$executeRaw`
      SELECT setval(
        pg_get_serial_sequence('products', 'id'),
        GREATEST((SELECT COALESCE(MAX(id), 0) FROM products), 1)
      )
    `,
    prisma.$executeRaw`
      SELECT setval(
        pg_get_serial_sequence('interests', 'id'),
        GREATEST((SELECT COALESCE(MAX(id), 0) FROM interests), 1)
      )
    `,
    prisma.$executeRaw`
      SELECT setval(
        pg_get_serial_sequence('shopping', 'id'),
        GREATEST((SELECT COALESCE(MAX(id), 0) FROM shopping), 1)
      )
    `,
    prisma.$executeRaw`
      SELECT setval(
        pg_get_serial_sequence('sync_log', 'id'),
        GREATEST((SELECT COALESCE(MAX(id), 0) FROM sync_log), 1)
      )
    `,
    prisma.$executeRaw`
      SELECT setval(
        pg_get_serial_sequence('promo_offers', 'id'),
        GREATEST((SELECT COALESCE(MAX(id), 0) FROM promo_offers), 1)
      )
    `,
  ]);
}

// ---------------------------------------------------------------------------
// Table loaders
// ---------------------------------------------------------------------------

async function loadProducts(prisma: PrismaClient, sqlite: Database.Database): Promise<number> {
  const rows = sqlite.prepare('SELECT * FROM products ORDER BY id').all() as SqliteProduct[];
  let loaded = 0;

  for (const chunk of chunks(rows, CHUNK_SIZE)) {
    const data = chunk.map((r) => ({
      id: r.id,
      super: r.super,
      product_id: r.product_id,
      sku_id: r.sku_id ?? null,
      name: r.name,
      barcode: r.barcode ?? null,
      image_url: r.image_url ?? null,
      product_url: r.product_url ?? null,
      raw_price: r.raw_price ?? null,
      offer_price: r.offer_price ?? null,
      discount_pct: r.discount_pct ?? 0,
      available: r.available === 1,
      categories: (tryParseJson(r.categories) ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
      promotions: (tryParseJson(r.promotions) ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
      synced_at: parseDateTime(r.synced_at) ?? new Date(),
    }));

    await prisma.products.createMany({ data, skipDuplicates: true });
    loaded += chunk.length;
    process.stdout.write(`\r[ETL] products: ${loaded}/${rows.length}`);
  }
  process.stdout.write('\n');
  return rows.length;
}

async function loadInterests(prisma: PrismaClient, sqlite: Database.Database): Promise<number> {
  const rows = sqlite.prepare('SELECT * FROM interests ORDER BY id').all() as SqliteInterest[];
  if (rows.length === 0) return 0;

  for (const chunk of chunks(rows, CHUNK_SIZE)) {
    const data = chunk.map((r) => ({
      id: r.id,
      product_id: r.product_id,
      // user_id: legacy SQLite data predates multi-tenancy; assigned to sentinel user 1.
      // TODO(PR2): historical data migration requires a real user if backfill is needed.
      user_id: 1,
      added_at: parseDateTime(r.added_at) ?? new Date(),
    }));
    await prisma.interests.createMany({ data, skipDuplicates: true });
  }
  return rows.length;
}

async function loadShopping(prisma: PrismaClient, sqlite: Database.Database): Promise<number> {
  const rows = sqlite.prepare('SELECT * FROM shopping ORDER BY id').all() as SqliteShopping[];
  if (rows.length === 0) return 0;

  for (const chunk of chunks(rows, CHUNK_SIZE)) {
    const data = chunk.map((r) => ({
      id: r.id,
      product_id: r.product_id,
      // user_id: legacy SQLite data predates multi-tenancy; assigned to sentinel user 1.
      user_id: 1,
      frequency_days: r.frequency_days ?? 7,
      last_bought: parseDateTime(r.last_bought),
      notes: r.notes ?? null,
      created_at: parseDateTime(r.created_at) ?? new Date(),
    }));
    await prisma.shopping.createMany({ data, skipDuplicates: true });
  }
  return rows.length;
}

async function loadSyncLog(prisma: PrismaClient, sqlite: Database.Database): Promise<number> {
  const rows = sqlite.prepare('SELECT * FROM sync_log ORDER BY id').all() as SqliteSyncLog[];
  if (rows.length === 0) return 0;

  for (const chunk of chunks(rows, CHUNK_SIZE)) {
    const data = chunk.map((r) => ({
      id: r.id,
      super: r.super,
      started_at: parseDateTime(r.started_at),
      finished_at: parseDateTime(r.finished_at),
      product_count: r.product_count ?? null,
      status: r.status,
      error: r.error ?? null,
      progress_leaf: r.progress_leaf ?? 0,
      total_leaves: r.total_leaves ?? 0,
    }));
    await prisma.sync_log.createMany({ data, skipDuplicates: true });
  }
  return rows.length;
}

async function loadPromoOffers(prisma: PrismaClient, sqlite: Database.Database): Promise<number> {
  const rows = sqlite
    .prepare('SELECT * FROM promo_offers ORDER BY id')
    .all() as SqlitePromoOffer[];
  if (rows.length === 0) return 0;

  for (const chunk of chunks(rows, CHUNK_SIZE)) {
    const data = chunk.map((r) => ({
      id: r.id,
      super: r.super,
      bank: r.bank ?? null,
      title: r.title ?? null,
      description: r.description ?? null,
      discount_pct: r.discount_pct ?? null,
      installments: r.installments ?? null,
      interest_free:
        r.interest_free == null ? null : r.interest_free === 1,
      logo_url: r.logo_url ?? null,
      image_url: r.image_url ?? null,
      validity: r.validity ?? null,
      source_url: r.source_url,
      captured_at: BigInt(r.captured_at),
    }));
    await prisma.promo_offers.createMany({ data, skipDuplicates: true });
  }
  return rows.length;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const force = process.argv.includes('--force');

  console.log('[ETL] Starting SQLite → PostgreSQL migration');
  console.log(`[ETL] Source: ${SQLITE_PATH}`);
  console.log(
    `[ETL] Target: ${connectionString.replace(/:\/\/[^@]+@/, '://<credentials>@')}`,
  );
  console.log(`[ETL] Chunk size: ${CHUNK_SIZE}`);

  // Open SQLite (read-only)
  const sqlite = new Database(SQLITE_PATH, { readonly: true });

  // Get source row counts before migration
  const sourceCounts: Record<string, number> = {
    products: (sqlite.prepare('SELECT COUNT(*) as c FROM products').get() as { c: number }).c,
    interests: (sqlite.prepare('SELECT COUNT(*) as c FROM interests').get() as { c: number }).c,
    shopping: (sqlite.prepare('SELECT COUNT(*) as c FROM shopping').get() as { c: number }).c,
    sync_log: (sqlite.prepare('SELECT COUNT(*) as c FROM sync_log').get() as { c: number }).c,
    promo_offers: (sqlite.prepare('SELECT COUNT(*) as c FROM promo_offers').get() as { c: number }).c,
  };

  console.log('\n[ETL] Source row counts:');
  for (const [table, count] of Object.entries(sourceCounts)) {
    console.log(`  ${table.padEnd(14)}: ${count}`);
  }

  // Create Prisma client
  const prisma = makePrisma();

  try {
    // Idempotency check (aborts or truncates depending on --force)
    await checkIdempotency(prisma, force);

    // Load tables in FK-safe order
    console.log('\n[ETL] Loading tables...');
    const startTime = Date.now();

    const loaded: Record<string, number> = {};
    loaded.products = await loadProducts(prisma, sqlite);
    loaded.interests = await loadInterests(prisma, sqlite);
    loaded.shopping = await loadShopping(prisma, sqlite);
    loaded.sync_log = await loadSyncLog(prisma, sqlite);
    loaded.promo_offers = await loadPromoOffers(prisma, sqlite);

    const elapsedMs = Date.now() - startTime;
    console.log(`[ETL] Load complete in ${(elapsedMs / 1000).toFixed(1)}s`);

    // Reset sequences
    console.log('[ETL] Resetting PostgreSQL sequences...');
    await resetSequences(prisma);
    console.log('[ETL] Sequences reset.');

    // Validate row counts
    console.log('\n[ETL] Validating row counts...');
    const reports = await validateCounts(prisma, sourceCounts);

    let allMatch = true;
    console.log(
      `\n${'Table'.padEnd(14)} ${'Source'.padStart(8)} ${'Postgres'.padStart(8)}  Status`,
    );
    console.log('-'.repeat(50));
    for (const r of reports) {
      const status = r.match ? 'OK' : 'MISMATCH';
      if (!r.match) allMatch = false;
      console.log(
        `${r.table.padEnd(14)} ${String(r.source).padStart(8)} ${String(r.destination).padStart(8)}  ${status}`,
      );
    }

    // Spot checks
    console.log('\n[ETL] Running spot checks...');
    const { passed: spotPassed, details: spotDetails } = await spotCheck(prisma, sqlite);
    for (const d of spotDetails) {
      console.log(`  ${d}`);
    }

    // Final summary
    console.log('\n' + '='.repeat(50));
    if (allMatch && spotPassed) {
      console.log('[ETL] Migration COMPLETE. All row counts match, spot checks passed.');
      console.log(
        '[ETL] Next steps: start the app with `npm run dev` and verify the catalog at http://localhost:3001',
      );
    } else {
      console.error('[ETL] Migration completed with WARNINGS — see mismatches above.');
      process.exit(1);
    }
  } finally {
    sqlite.close();
    await prisma.$disconnect();
  }
}

await main();
