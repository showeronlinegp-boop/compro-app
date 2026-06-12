/**
 * main.ts — Pure TypeScript composition root.
 *
 * Wires all module factories:
 *   interests, shopping, catalog, taxonomy — via createApp
 *   crawler  — makeCrawlerService + makeCrawlerRouter
 *   enricher — makeEnricher + makeEnrichmentRouter
 *   promos   — makePromosRepo + makePromoCaptureService + makePromosRouter
 */

import cron from 'node-cron';
import { DB_PATH, PORT } from './config/env.js';
import { makeCrawlerRouter } from './crawler/infrastructure/crawler.routes.js';
import { makeCrawlerService } from './crawler/infrastructure/crawler.service.js';
import { makeEnricher } from './enrichment/infrastructure/enricher.service.js';
import { makeEnrichmentRouter } from './enrichment/infrastructure/enrichment.routes.js';
import { createApp } from './http/app.js';
import { createDb } from './infrastructure/db/client.js';
import { runMigrations } from './infrastructure/db/migrations.js';
import { makePromoCaptureService } from './modules/promos/infrastructure/promo-capture.service.js';
import { makePromosRepo } from './modules/promos/infrastructure/promos.repo.js';
import { makePromosRouter } from './modules/promos/infrastructure/promos.routes.js';

// ─── Boot sequence ────────────────────────────────────────────────────────────

const db = createDb(DB_PATH);
runMigrations(db);

// ── TypeScript enricher ────────────────────────────────────────────────────────
const enricher = makeEnricher(db);
const enrichmentRouter = makeEnrichmentRouter(enricher, db);

// ── TypeScript crawler service ─────────────────────────────────────────────────
const crawlerService = makeCrawlerService({
  db,
  enrichSuper: (key) => enricher.enrichSuper(key),
});
const crawlerRouter = makeCrawlerRouter(crawlerService);

// ── Promos ─────────────────────────────────────────────────────────────────────
const promosRepo = makePromosRepo(db);
const promoCaptureService = makePromoCaptureService({ db });
const promosRouter = makePromosRouter({ repo: promosRepo, captureService: promoCaptureService });

// ── TypeScript app ─────────────────────────────────────────────────────────────
const app = createApp({ db, crawlerRouter, enrichmentRouter, promosRouter });

// ── Cron: daily sync at 3 AM ──────────────────────────────────────────────────
cron.schedule('0 3 * * *', () => {
  console.log('[cron] Daily sync starting...');
  crawlerService
    .syncAll()
    .then((r) => console.log('[cron] Sync complete:', r))
    .catch((err: Error) => console.error('[cron] Sync error:', err.message));
});

// ── Cron: weekly promo capture at 4 AM on Mondays ────────────────────────────
cron.schedule('0 4 * * 1', () => {
  console.log('[cron] Weekly promo capture starting...');
  promoCaptureService
    .captureAll()
    .then((r) => console.log('[cron] Promo capture complete:', r))
    .catch((err: Error) => console.error('[cron] Promo capture error:', err.message));
});

// ── Listen ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`COMPRO backend running on http://localhost:${PORT}`);
  console.log('[main] Pure TypeScript mode: all legacy JS removed');
});
