/**
 * infrastructure/db/index.ts — public API for the database layer.
 *
 * Exports the PrismaClient singleton. Callers import from this path, not
 * from prisma-client.ts directly.
 *
 * TODO(Slice-B): Delete or stub client.ts, migrations.ts, functions.ts once
 * all repos are migrated to Prisma.
 */
export { prisma } from './prisma-client.js';
