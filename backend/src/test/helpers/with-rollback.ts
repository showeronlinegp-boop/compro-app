/**
 * with-rollback.ts — Per-test transaction rollback helper for Prisma + Postgres.
 *
 * Usage:
 *   it('creates a product', async () => {
 *     await withRollback(async (tx) => {
 *       const repo = makeInterestsRepo(tx);
 *       ...assertions...
 *     });
 *   });
 *
 * Mechanism: wraps the test body in prisma.$transaction(async (tx) => { ...;
 * throw ROLLBACK_SENTINEL }), catches the sentinel, and suppresses it.
 * This leaves the DB in its original state after every test.
 *
 * IMPORTANT: repos that open their OWN $transaction (syncRepo.upsertProducts,
 * promosRepo.replaceForSuper) CANNOT be wrapped with withRollback — Prisma
 * does not support nested interactive transactions. For those tests use
 * truncateAll() instead.
 *
 * Pool compatibility: vitest pool:forks — each test FILE is a separate process.
 * All forks share the same test DB; because every test rolls back its writes,
 * there is no cross-test bleed even with concurrent forks.
 */

import { testPrisma } from './test-client.js';

// Sentinel error used to force a rollback at the end of every test
class RollbackSentinel extends Error {
  constructor() {
    super('__ROLLBACK_SENTINEL__');
    this.name = 'RollbackSentinel';
  }
}

type TransactionClient = Parameters<Parameters<typeof testPrisma.$transaction>[0]>[0];

/**
 * Run `fn` inside a Prisma interactive transaction that is always rolled back.
 * The `tx` passed to `fn` is the Prisma transaction client — pass it to repo
 * factories instead of `testPrisma`.
 */
export async function withRollback<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
  let result: T | undefined;

  try {
    await testPrisma.$transaction(
      async (tx) => {
        result = await fn(tx);
        // Always roll back — throw sentinel after capturing the result
        throw new RollbackSentinel();
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  } catch (err) {
    if (!(err instanceof RollbackSentinel)) {
      throw err;
    }
    // Sentinel caught — rollback succeeded
  }

  // result is always set when we reach here (RollbackSentinel is thrown after fn resolves)
  return result as T;
}

/**
 * Delete all rows from all tables in FK-safe order (children before parents).
 * Use this for repos that open their own $transaction (cannot nest in withRollback).
 *
 * Uses DELETE instead of TRUNCATE to avoid ACCESS EXCLUSIVE locks that deadlock
 * with concurrent $transaction operations in parallel test forks.
 */
export async function truncateAll(): Promise<void> {
  await testPrisma.$transaction([
    testPrisma.$executeRaw`DELETE FROM interests`,
    testPrisma.$executeRaw`DELETE FROM shopping`,
    testPrisma.$executeRaw`DELETE FROM promo_offers`,
    testPrisma.$executeRaw`DELETE FROM sync_log`,
    testPrisma.$executeRaw`DELETE FROM products`,
  ]);
}
