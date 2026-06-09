import * as nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Application } from 'express';
import express from 'express';

/**
 * Mounts the compiled frontend (Vite dist/) on the Express app.
 * Resolves the path relative to dist/main.js (the compiled output location)
 * using import.meta.url so it works correctly after tsup bundling.
 *
 * Mirrors the static serving logic in server.js verbatim:
 *   1. Serve static files from frontend/dist
 *   2. SPA fallback: all unmatched GETs return index.html
 */
export function mountStatic(app: Application): void {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = nodePath.dirname(__filename);

  // When running from dist/main.js: __dirname is <project>/backend/dist
  // When running via tsx watch src/main.ts: __dirname is <project>/backend/src/http
  // Both cases need to go up to the project root and then to frontend/dist.
  const DIST = nodePath.join(__dirname, '..', '..', '..', 'frontend', 'dist');

  app.use(express.static(DIST));
  app.get('*', (_req, res) => {
    res.sendFile(nodePath.join(DIST, 'index.html'));
  });
}
