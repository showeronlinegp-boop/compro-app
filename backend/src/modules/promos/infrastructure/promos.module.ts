import { Module } from '@nestjs/common';
import { PROMO_CAPTURE_SERVICE, PROMOS_REPO } from '../../../common/tokens.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { PromosController } from './promos.controller.js';
import { makePromoCaptureService } from './promo-capture.service.js';
import { makePromosRepo } from './promos.repo.js';

@Module({
  providers: [
    {
      provide: PROMOS_REPO,
      useFactory: (prisma: PrismaService) => makePromosRepo(prisma),
      inject: [PrismaService],
    },
    {
      provide: PROMO_CAPTURE_SERVICE,
      useFactory: (prisma: PrismaService) => makePromoCaptureService({ prisma }),
      inject: [PrismaService],
    },
  ],
  controllers: [PromosController],
  exports: [PROMO_CAPTURE_SERVICE],
})
export class PromosModule {}
