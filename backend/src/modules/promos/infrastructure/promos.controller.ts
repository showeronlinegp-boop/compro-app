import { Controller, Get, Inject, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PROMO_CAPTURE_SERVICE, PROMOS_REPO } from '../../../common/tokens.js';
import type { PromoCaptureService } from './promo-capture.service.js';
import { PROMO_TARGETS } from './promo-targets.js';
import type { PromosRepo } from './promos.repo.js';

@Controller('api/promos')
export class PromosController {
  constructor(
    @Inject(PROMOS_REPO) private readonly repo: PromosRepo,
    @Inject(PROMO_CAPTURE_SERVICE) private readonly captureService: PromoCaptureService,
  ) {}

  @Get()
  async list() {
    const rows = await this.repo.listAll();
    return rows.map((r) => ({
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
  }

  // POST /capture — fire-and-forget all supers; 409 if any already capturing
  // Declared before /capture/:super so Nest matches the static path first
  @Post('capture')
  captureAll(@Res() res: Response): void {
    const knownSupers = Object.keys(PROMO_TARGETS);
    const busy = knownSupers.some((k) => this.captureService.isCapturing(k));
    if (busy) {
      res.status(409).json({ error: 'Capture already in progress' });
      return;
    }

    res.status(200).json({ ok: true, message: 'Promo capture started for all supers' });

    this.captureService
      .captureAll()
      .catch((err: Error) => console.error('[promo:captureAll] Error:', err.message));
  }

  // POST /capture/:super — fire-and-forget single super
  @Post('capture/:super')
  captureOne(@Param('super') key: string, @Res() res: Response): void {
    if (this.captureService.isCapturing(key)) {
      res.status(409).json({ error: `Capture for ${key} already in progress` });
      return;
    }

    res.status(200).json({ ok: true, message: `Promo capture started for ${key}` });

    this.captureService
      .captureSuper(key)
      .catch((err: Error) => console.error(`[promo:${key}] Error:`, err.message));
  }
}
