import { Module } from '@nestjs/common';
import { CRAWLER_SERVICE, ENRICH_SERVICE } from '../../common/tokens.js';
import { EnrichmentModule } from '../../enrichment/infrastructure/enrichment.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { EnrichService } from '../../enrichment/infrastructure/enricher.service.js';
import { CrawlerController } from './crawler.controller.js';
import { makeCrawlerService } from './crawler.service.js';

@Module({
  imports: [EnrichmentModule],
  providers: [
    {
      provide: CRAWLER_SERVICE,
      useFactory: (prisma: PrismaService, enricher: EnrichService) =>
        makeCrawlerService({
          prisma,
          enrichSuper: (key: string) => enricher.enrichSuper(key),
        }),
      inject: [PrismaService, ENRICH_SERVICE],
    },
  ],
  controllers: [CrawlerController],
  exports: [CRAWLER_SERVICE],
})
export class CrawlerModule {}
