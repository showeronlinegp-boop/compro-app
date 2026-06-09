import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  external: ['better-sqlite3'],
  sourcemap: true,
  clean: true,
  outDir: 'dist',
});
