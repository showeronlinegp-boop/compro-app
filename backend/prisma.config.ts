import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 configuration: connection URL lives here (removed from schema.prisma in v7).
// DATABASE_URL is required — no hardcoded fallback, so a missing env fails loudly
// instead of silently pointing at a default database.
// Migrate: the Prisma CLI reads datasource.url from this config.
// Runtime: PrismaClient is built with the @prisma/adapter-pg adapter in
//   infrastructure/db/prisma-client.ts, which reads DATABASE_URL from the env.
export default defineConfig({
  schema: './prisma/schema.prisma',
  migrations: {
    path: './prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
