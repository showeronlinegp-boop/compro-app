/**
 * main.ts — Pure TypeScript composition root (Slice 6 final cutover).
 *
 * All legacy CJS interop (createRequire, enricher.js, db.js) has been removed.
 * Wires all 6 module factories:
 *   interests, shopping, catalog, taxonomy — via createApp
 *   crawler  — makeCrawlerService + makeCrawlerRouter
 *   enricher — makeEnricher + makeEnrichmentRouter
 *
 * scheduleDailySync cron delegates to TS crawlerService.
 * Crawler fire-and-forget enrich trigger now calls the TS enricher.
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

// ─── Boot sequence ────────────────────────────────────────────────────────────

const db = createDb(DB_PATH);
runMigrations(db);

// ── TypeScript enricher ────────────────────────────────────────────────────────
const enricher = makeEnricher(db);
const enrichmentRouter = makeEnrichmentRouter(enricher, db);

// ── TypeScript crawler service ─────────────────────────────────────────────────
const crawlerService = makeCrawlerService({
  db,
  // Fire-and-forget enrich trigger — now calls the TS enricher (Slice 6 cutover)
  enrichSuper: (key) => enricher.enrichSuper(key),
});
const crawlerRouter = makeCrawlerRouter(crawlerService);

// ── TypeScript app ─────────────────────────────────────────────────────────────
const app = createApp({ db, crawlerRouter, enrichmentRouter });

// ── Cron: daily sync at 3 AM ──────────────────────────────────────────────────
cron.schedule('0 3 * * *', () => {
  console.log('[cron] Daily sync starting...');
  crawlerService
    .syncAll()
    .then((r) => console.log('[cron] Sync complete:', r))
    .catch((err: Error) => console.error('[cron] Sync error:', err.message));
});

// ── Listen ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`COMPRO backend running on http://localhost:${PORT}`);
  console.log('[main] Pure TypeScript mode: all legacy JS removed');
});
