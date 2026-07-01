import { Controller, Get, Inject } from '@nestjs/common';
import { PROMOS_REPO } from '../../../common/tokens.js';
import { Public } from '../../../common/auth/public.decorator.js';
import type { PromosRepo } from './promos.repo.js';

// POST /api/promos/capture/* removed in PR2 (Decision 5): operational triggers are now ops CLI only.
// The scheduler (scheduler.service.ts) still calls PromoCaptureService.captureAll() directly.
// The ops CLI (scripts/ops.ts) provides manual promo triggers.

@Controller('api/promos')
export class PromosController {
  constructor(
    @Inject(PROMOS_REPO) private readonly repo: PromosRepo,
  ) {}

  @Public()
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
}
