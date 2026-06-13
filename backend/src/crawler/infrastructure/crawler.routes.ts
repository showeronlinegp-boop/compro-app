/**
 * crawler.routes.ts — HTTP routes for the sync API.
 *
 * Port of the /api/sync/* endpoints from backend/server.js (as wired in main.ts).
 * Contract:
 *   GET  /status  → getSyncStatus() result (all supers)
 *   POST /all      → fire-and-forget syncAll (every super, sequential); 409 if any running
 *   POST /:super  → fire-and-forget syncSuper; 409 if already running
 */

import { Router } from 'express';
import { SUPERS } from '../../config/supers.js';
import type { CrawlerService } from './crawler.service.js';

export function makeCrawlerRouter(service: CrawlerService): Router {
  const router = Router();

  router.get('/status', async (_req, res) => {
    try {
      res.json(await service.getSyncStatus());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Registered before /:super so the literal path wins over the param route.
  router.post('/all', (_req, res) => {
    const busy = Object.keys(SUPERS).some((key) => service.isRunning(key));
    if (busy) {
      return void res.status(409).json({ error: 'Sync ya en curso' });
    }

    res.json({ ok: true, message: 'Sync de todos los supers iniciado' });

    // Sequential crawl of every super (single SQLite writer); fire-and-forget.
    service.syncAll().catch((err: Error) => console.error('Sync all failed:', err.message));
  });

  router.post('/:super', (req, res) => {
    const key = req.params.super as string;

    if (service.isRunning(key)) {
      return void res.status(409).json({ error: 'Sync ya en curso' });
    }

    res.json({ ok: true, message: `Sync de ${key} iniciado` });

    service.syncSuper(key).catch((err: Error) => console.error(`Sync ${key} failed:`, err.message));
  });

  return router;
}
