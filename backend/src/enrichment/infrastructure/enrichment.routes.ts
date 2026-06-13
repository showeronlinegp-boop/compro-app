/**
 * enrichment.routes.ts — Express router for enrichment endpoints.
 *
 * Mirrors the exact API contract from legacy server.js:
 *   GET  /api/enrich/status    — returns status map for all supers
 *   POST /api/enrich/:super    — fire-and-forget enrich for one super, 409 guard
 *   POST /api/enrich           — fire-and-forget enrich for all distinct supers in DB
 *
 * The POST /api/enrich route queries distinct supers from products table.
 */

import type { PrismaClient } from '@prisma/client';
import { Router } from 'express';
import type { EnrichService } from './enricher.service.js';

export function makeEnrichmentRouter(enricher: EnrichService, prisma: PrismaClient): Router {
  const router = Router();

  // GET /status — returns all super statuses
  router.get('/status', (_req, res) => {
    res.json(enricher.getStatus());
  });

  // POST /:super — enrich a single super (fire-and-forget, 409 guard)
  router.post('/:super', (req, res) => {
    const key = req.params.super as string;
    if (enricher.isRunning(key)) {
      return void res.status(409).json({ error: 'Enrichment ya en curso' });
    }
    res.json({ ok: true, message: `Enriquecimiento de ${key} iniciado` });
    enricher
      .enrichSuper(key)
      .catch((err: Error) => console.error(`Enrich ${key} failed:`, err.message));
  });

  // POST / — enrich all distinct supers from products table (fire-and-forget)
  router.post('/', (_req, res) => {
    // Async: get distinct supers, then start enrichment
    prisma.products
      .findMany({ distinct: ['super'], select: { super: true } })
      .then((rows) => {
        const keys = rows.map((r) => r.super);
        res.json({
          ok: true,
          message: 'Enriquecimiento de todos los supers iniciado',
          supers: keys,
        });
        for (const key of keys) {
          if (!enricher.isRunning(key)) {
            enricher
              .enrichSuper(key)
              .catch((err: Error) => console.error(`Enrich ${key} failed:`, err.message));
          }
        }
      })
      .catch((err: Error) => {
        res.status(500).json({ error: err.message });
      });
  });

  return router;
}
