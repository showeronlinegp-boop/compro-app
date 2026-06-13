import { Module } from '@nestjs/common';
import { ENRICH_SERVICE } from '../../common/tokens.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EnrichmentController } from './enrichment.controller.js';
import { makeEnricher } from './enricher.service.js';

@Module({
  providers: [
    {
      provide: ENRICH_SERVICE,
      useFactory: (prisma: PrismaService) => makeEnricher(prisma),
      inject: [PrismaService],
    },
  ],
  controllers: [EnrichmentController],
  exports: [ENRICH_SERVICE],
})
export class EnrichmentModule {}
