import type Database from 'better-sqlite3';
import cors from 'cors';
import express, { type Application, type Router } from 'express';
import { makeCatalogRouter } from '../modules/catalog/infrastructure/catalog.routes.js';
import { makeInterestsRouter } from '../modules/interests/infrastructure/interests.routes.js';
import { makeShoppingRouter } from '../modules/shopping/infrastructure/shopping.routes.js';
import { TAXONOMY } from '../modules/taxonomy/domain/taxonomy.js';
import { errorMiddleware } from './error-middleware.js';
import { mountStatic } from './static.js';

export interface AppDeps {
  db: Database.Database;
  /** TypeScript crawler router (Slice 5+). When provided, mounted at /api/sync. */
  crawlerRouter?: Router;
  /** TypeScript enrichment router (Slice 6+). When provided, mounted at /api/enrich. */
  enrichmentRouter?: Router;
}

/**
 * Creates and wires the Express application.
 * - CORS + JSON body parsing
 * - /api/interests  (TypeScript router, Slice 1)
 * - /api/shopping   (TypeScript router, Slice 2)
 * - /api/products   (TypeScript router, Slice 3)
 * - /api/sync       (TypeScript crawler router, Slice 5+)
 * - /api/enrich     (TypeScript enrichment router, Slice 6+)
 * - Error middleware
 * - Static frontend serving (last, with SPA fallback)
 */
export function createApp(deps: AppDeps): Application {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // ── TypeScript routes ──────────────────────────────────────────────────────
  app.use('/api/interests', makeInterestsRouter(deps.db));
  app.use('/api/shopping', makeShoppingRouter(deps.db));
  app.use('/api/products', makeCatalogRouter(deps.db, TAXONOMY));

  if (deps.crawlerRouter) {
    app.use('/api/sync', deps.crawlerRouter);
  }

  if (deps.enrichmentRouter) {
    app.use('/api/enrich', deps.enrichmentRouter);
  }

  // ── Error handling ─────────────────────────────────────────────────────────
  app.use(errorMiddleware);

  // ── Static frontend (must be last) ────────────────────────────────────────
  mountStatic(app);

  return app;
}
