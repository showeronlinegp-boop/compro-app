import { defineConfig } from 'prisma/config';

// Prisma 7 configuration: connection URL is provided here (not in schema.prisma).
// DATABASE_URL env var is required; both `prisma migrate` and runtime use it.
// Runtime: PrismaClient is constructed with the @prisma/adapter-pg adapter in
//   infrastructure/db/prisma-client.ts (reads DATABASE_URL from env directly).
// Migrate: Prisma CLI reads datasource.url from this config at migrate time.
export default defineConfig({
  earlyAccess: true,
  schema: './prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://compro:compro@localhost:5433/compro',
  },
});
