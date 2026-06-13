/**
 * test-client.ts — PrismaClient singleton for integration tests.
 *
 * Connects to DATABASE_URL_TEST (compro_test database). Each test file
 * imports this client and uses withRollback() to wrap operations in a
 * rolled-back transaction for isolation.
 *
 * Prisma 7 requires the PrismaPg adapter — new PrismaClient() without it throws.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const TEST_URL =
  process.env.DATABASE_URL_TEST ??
  process.env.DATABASE_URL ??
  'postgresql://compro:compro@localhost:5433/compro_test?connection_limit=5';

const adapter = new PrismaPg({ connectionString: TEST_URL });

export const testPrisma = new PrismaClient({
  adapter,
  log: [],
});
