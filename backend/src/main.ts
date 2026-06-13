/**
 * main.ts — Pure TypeScript composition root (Postgres/Prisma).
 *
 * Wires all module factories using the PrismaClient singleton:
 *   interests, shopping, catalog, taxonomy — via createApp
 *   crawler  — makeCrawlerService + makeCrawlerRouter
 *   enricher — makeEnricher + makeEnrichmentRouter
 *   promos   — makePromosRepo + makePromoCaptureService + makePromosRouter
 *
 * SQLite bootstrap (createDb/runMigrations) has been removed.
 * DB_PATH env var has been removed — Prisma reads DATABASE_URL directly.
 */

import cron from 'node-cron';
import { PORT } from './config/env.js';
import { makeCrawlerRouter } from './crawler/infrastructure/crawler.routes.js';
import { makeCrawlerService } from './crawler/infrastructure/crawler.service.js';
import { makeEnricher } from './enrichment/infrastructure/enricher.service.js';
import { makeEnrichmentRouter } from './enrichment/infrastructure/enrichment.routes.js';
import { createApp } from './http/app.js';
import { prisma } from './infrastructure/db/index.js';
import { makePromoCaptureService } from './modules/promos/infrastructure/promo-capture.service.js';
import { makePromosRepo } from './modules/promos/infrastructure/promos.repo.js';
import { makePromosRouter } from './modules/promos/infrastructure/promos.routes.js';

// ─── Boot sequence ────────────────────────────────────────────────────────────

// ── Enricher ───────────────────────────────────────────────────────────────────
const enricher = makeEnricher(prisma);
const enrichmentRouter = makeEnrichmentRouter(enricher, prisma);

// ── Crawler service ────────────────────────────────────────────────────────────
const crawlerService = makeCrawlerService({
  prisma,
  enrichSuper: (key) => enricher.enrichSuper(key),
});
const crawlerRouter = makeCrawlerRouter(crawlerService);

// ── Promos ─────────────────────────────────────────────────────────────────────
const promosRepo = makePromosRepo(prisma);
const promoCaptureService = makePromoCaptureService({ prisma });
const promosRouter = makePromosRouter({ repo: promosRepo, captureService: promoCaptureService });

// ── Express app ────────────────────────────────────────────────────────────────
const app = createApp({ prisma, crawlerRouter, enrichmentRouter, promosRouter });

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
  console.log('[main] PostgreSQL/Prisma mode: SQLite removed');
});
