import { Module } from '@nestjs/common';
import { CrawlerModule } from '../crawler/infrastructure/crawler.module.js';
import { PromosModule } from '../modules/promos/infrastructure/promos.module.js';
import { SchedulerService } from './scheduler.service.js';

@Module({
  imports: [CrawlerModule, PromosModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
