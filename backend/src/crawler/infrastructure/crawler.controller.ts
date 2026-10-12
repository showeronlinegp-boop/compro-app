import { Controller, Get, Inject } from '@nestjs/common';
import { CRAWLER_SERVICE } from '../../common/tokens.js';
import { Public } from '../../common/auth/public.decorator.js';
import type { CrawlerService } from './crawler.service.js';

// POST /api/sync/* removed in PR2 (Decision 5): operational triggers are now ops CLI only.
// The scheduler (scheduler.service.ts) still calls crawler.syncAll() directly.
// The ops CLI (scripts/ops.ts) provides manual triggers for sync/enrich/promos.

@Controller('api/sync')
export class CrawlerController {
  constructor(
    @Inject(CRAWLER_SERVICE) private readonly service: CrawlerService,
  ) {}

  // GET /status — returns ARRAY (critical regression guard vs the old {} bug)
  @Public()
  @Get('status')
  async getStatus() {
    return this.service.getSyncStatus();
  }
}
