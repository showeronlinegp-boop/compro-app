/**
 * global-setup.ts — Vitest global setup for Postgres integration tests.
 *
 * Runs ONCE before all test files (not per-fork). Applies Prisma migrations
 * to the test database (DATABASE_URL_TEST) so the schema is ready for all
 * integration tests. This replaces the per-test runMigrations() + SQLite
 * temp-file approach used before the Postgres migration.
 *
 * Pool: forks — each test FILE is a separate OS process. The DB is shared
 * across forks; isolation is achieved by per-test transaction rollback
 * (withRollback helper) or TRUNCATE (for repos that open their own $transaction).
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export async function setup(): Promise<void> {
  const testUrl =
    process.env.DATABASE_URL_TEST ??
    'postgresql://compro:compro@localhost:5433/compro_test?connection_limit=5';

  // Point Prisma at the test database for migrate deploy
  process.env.DATABASE_URL = testUrl;

  console.log('[global-setup] Applying Prisma migrations to test DB...');
  try {
    const { stdout, stderr } = await execAsync('npx prisma migrate deploy', {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: testUrl },
    });
    if (stdout) console.log('[global-setup]', stdout.trim());
    if (stderr) console.warn('[global-setup]', stderr.trim());
    console.log('[global-setup] Migrations applied successfully.');
  } catch (err) {
    console.error('[global-setup] Migration failed:', (err as Error).message);
    throw err;
  }
}

export async function teardown(): Promise<void> {
  // Nothing to tear down — test DB persists between runs (migrations are idempotent)
}
