/**
 * crawler.routes.ts — HTTP routes for the sync API.
 *
 * Port of the /api/sync/* endpoints from backend/server.js (as wired in main.ts).
 * Contract is IDENTICAL to the legacy implementation:
 *   GET  /status  → getSyncStatus() result (all supers)
 *   POST /:super  → fire-and-forget syncSuper; 409 if already running
 */

import { Router } from 'express';
import type { CrawlerService } from './crawler.service.js';

export function makeCrawlerRouter(service: CrawlerService): Router {
  const router = Router();

  router.get('/status', (_req, res) => {
    res.json(service.getSyncStatus());
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
