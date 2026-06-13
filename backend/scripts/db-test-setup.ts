/**
 * db-test-setup.ts — Apply Prisma migrations to the test database.
 *
 * Reads DATABASE_URL_TEST from the environment (loaded from backend/.env via dotenv)
 * and runs `prisma migrate deploy` against the test database. No connection string
 * is hardcoded here — credentials live exclusively in backend/.env.
 *
 * Usage:
 *   npm run db:test:setup          (via package.json)
 *   npx tsx scripts/db-test-setup.ts
 */

import 'dotenv/config';
import { execSync } from 'node:child_process';

const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) {
  throw new Error(
    '[db-test-setup] DATABASE_URL_TEST is required — set it in backend/.env (see .env.example)',
  );
}

console.log('[db-test-setup] Applying Prisma migrations to test database...');

execSync('prisma migrate deploy', {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: testUrl },
});

console.log('[db-test-setup] Done.');
