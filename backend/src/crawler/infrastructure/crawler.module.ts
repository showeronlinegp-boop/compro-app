import { Module } from '@nestjs/common';
import { CRAWLER_SERVICE, ENRICH_SERVICE, PROFILE_REPO } from '../../common/tokens.js';
import type { EnrichService } from '../../enrichment/infrastructure/enricher.service.js';
import { EnrichmentModule } from '../../enrichment/infrastructure/enrichment.module.js';
import { makeProfileRepo } from '../../modules/profile/infrastructure/profile.repo.js';
import { PrismaService } from '../../prisma/prisma.service.js';
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
    // Local stateless profile repo so the sync guard can read the user's region.
    {
      provide: PROFILE_REPO,
      useFactory: (prisma: PrismaService) => makeProfileRepo(prisma),
      inject: [PrismaService],
    },
  ],
  controllers: [CrawlerController],
  exports: [CRAWLER_SERVICE],
})
export class CrawlerModule {}
