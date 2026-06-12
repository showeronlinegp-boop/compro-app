import { Router } from 'express';
import { asyncHandler } from '../../../shared/http.js';
import type { PromoCaptureService } from './promo-capture.service.js';
import { PROMO_TARGETS } from './promo-targets.js';
import type { PromosRepo } from './promos.repo.js';

export interface PromosRouterDeps {
  repo: PromosRepo;
  captureService: PromoCaptureService;
}

/**
 * Creates the promos router.
 *   GET  /          → list all promo offers (structured)
 *   POST /capture   → fire-and-forget captureAll (409 if any super is capturing)
 *   POST /capture/:super → fire-and-forget captureSuper (409 if already capturing)
 */
export function makePromosRouter({ repo, captureService }: PromosRouterDeps): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const rows = repo.listAll();
      const response = rows.map((r) => ({
        id: r.id,
        super: r.super,
        bank: r.bank,
        title: r.title,
        description: r.description,
        discountPct: r.discount_pct,
        installments: r.installments,
        interestFree: r.interest_free === null ? null : r.interest_free === 1,
        logoUrl: r.logo_url,
        imageUrl: r.image_url,
        validity: r.validity,
        capturedAt: r.captured_at,
        sourceUrl: r.source_url,
      }));
      res.json(response);
    }),
  );

  // POST /capture — fire-and-forget all supers; 409 if any already capturing
  router.post('/capture', (_req, res) => {
    const knownSupers = Object.keys(PROMO_TARGETS);
    const busy = knownSupers.some((k) => captureService.isCapturing(k));
    if (busy) {
      return void res.status(409).json({ error: 'Capture already in progress' });
    }

    res.json({ ok: true, message: 'Promo capture started for all supers' });

    captureService
      .captureAll()
      .catch((err: Error) => console.error('[promo:captureAll] Error:', err.message));
  });

  // POST /capture/:super — fire-and-forget single super
  router.post('/capture/:super', (req, res) => {
    const key = req.params.super as string;

    if (captureService.isCapturing(key)) {
      return void res.status(409).json({ error: `Capture for ${key} already in progress` });
    }

    res.json({ ok: true, message: `Promo capture started for ${key}` });

    captureService
      .captureSuper(key)
      .catch((err: Error) => console.error(`[promo:${key}] Error:`, err.message));
  });

  return router;
}
