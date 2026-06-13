/**
 * prisma-client.ts — PrismaClient module singleton for PostgreSQL (via @prisma/adapter-pg).
 *
 * Prisma 7 requires passing the database adapter to PrismaClient at construction time
 * (DATABASE_URL is no longer read from schema.prisma). This module exports a single
 * PrismaClient instance, created once per process via the module cache.
 *
 * connection_limit=25 is set in the DATABASE_URL (documented in .env.example) to
 * safely cover the enricher's max concurrency (htmlConc=20 + headroom).
 * See design §4 — Concurrency concern: enricher runPool.
 *
 * Lifecycle: SIGINT / SIGTERM and beforeExit handlers call $disconnect() exactly once.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { DATABASE_URL, IS_PRODUCTION } from '../../config/env.js';

const adapter = new PrismaPg({ connectionString: DATABASE_URL });

export const prisma = new PrismaClient({
  adapter,
  log: IS_PRODUCTION ? ['error'] : ['warn', 'error'],
});

// Register process lifecycle handlers exactly once (module is a singleton).
let _disconnectHandlersInstalled = false;

if (!_disconnectHandlersInstalled) {
  _disconnectHandlersInstalled = true;

  const disconnect = async (): Promise<void> => {
    try {
      await prisma.$disconnect();
    } catch {
      // ignore — already disconnected
    }
  };

  process.once('SIGINT', async () => {
    await disconnect();
    process.exit(0);
  });

  process.once('SIGTERM', async () => {
    await disconnect();
    process.exit(0);
  });

  process.once('beforeExit', () => {
    void disconnect();
  });
}
