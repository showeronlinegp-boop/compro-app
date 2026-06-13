import { Injectable, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CRAWLER_SERVICE, PROMO_CAPTURE_SERVICE } from '../common/tokens.js';
import type { CrawlerService } from '../crawler/infrastructure/crawler.service.js';
import type { PromoCaptureService } from '../modules/promos/infrastructure/promo-capture.service.js';

@Injectable()
export class SchedulerService {
  constructor(
    @Inject(CRAWLER_SERVICE) private readonly crawler: CrawlerService,
    @Inject(PROMO_CAPTURE_SERVICE) private readonly promos: PromoCaptureService,
  ) {}

  // Daily sync at 03:00 every day
  @Cron('0 3 * * *')
  dailySync() {
    console.log('[scheduler] Daily sync triggered');
    this.crawler
      .syncAll()
      .catch((err: Error) => console.error('[scheduler] Daily sync failed:', err.message));
  }

  // Weekly promo capture at 04:00 every Monday
  @Cron('0 4 * * 1')
  weeklyPromoCapture() {
    console.log('[scheduler] Weekly promo capture triggered');
    this.promos
      .captureAll()
      .catch((err: Error) => console.error('[scheduler] Weekly promo capture failed:', err.message));
  }
}
