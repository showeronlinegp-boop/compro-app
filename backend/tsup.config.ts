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
  // Sin source maps: producción arranca sin --enable-source-maps (no se usaban)
  // y el .map llevaba una copia del código fuente a la imagen.
  sourcemap: false,
  clean: true,
  outDir: 'dist',
  // Build de producción: las herramientas de desarrollo (notas de prueba) quedan
  // como código muerto y esbuild las elimina del bundle (ver app.module.ts).
  define: { 'process.env.COMPRO_PROD_BUILD': '"1"' },
});
