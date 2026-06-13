import { defineConfig } from 'tsup';

// @prisma/client and .prisma/client resolve from node_modules at runtime — they must not
// be bundled. The generated query engine binary lives under .prisma/client and is accessed
// via a relative require from the client package.
// better-sqlite3 is now a devDependency (ETL script only); it is no longer in the runtime
// bundle — omit it from the external list.
export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  external: ['@prisma/client', '.prisma/client', '@prisma/engines', 'dotenv'],
  sourcemap: true,
  clean: true,
  outDir: 'dist',
});
