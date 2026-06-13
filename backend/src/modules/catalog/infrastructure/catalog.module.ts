import { Module } from '@nestjs/common';
import { CATALOG_REPO } from '../../../common/tokens.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { makeCatalogRepo } from './catalog.repo.js';
import { CatalogController } from './catalog.controller.js';

@Module({
  providers: [
    {
      provide: CATALOG_REPO,
      useFactory: (prisma: PrismaService) => makeCatalogRepo(prisma),
      inject: [PrismaService],
    },
  ],
  controllers: [CatalogController],
})
export class CatalogModule {}
