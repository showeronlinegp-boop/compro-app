/**
 * infrastructure/db/index.ts — public API for the database layer.
 *
 * Exports the PrismaClient singleton. Callers import from this path, not
 * from prisma-client.ts directly.
 */
export { prisma } from './prisma-client.js';
