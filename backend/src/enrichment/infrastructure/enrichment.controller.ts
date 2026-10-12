import { Controller, Get, Inject } from '@nestjs/common';
import { ENRICH_SERVICE } from '../../common/tokens.js';
import { Public } from '../../common/auth/public.decorator.js';
import type { EnrichService } from './enricher.service.js';

// POST /api/enrich/* removed in PR2 (Decision 5): operational triggers are now ops CLI only.
// The scheduler and ops CLI call EnrichService directly without HTTP.

@Controller('api/enrich')
export class EnrichmentController {
  constructor(
    @Inject(ENRICH_SERVICE) private readonly enricher: EnrichService,
  ) {}

  // GET /status — returns all super statuses (in-memory object)
  @Public()
  @Get('status')
  getStatus() {
    return this.enricher.getStatus();
  }
}
