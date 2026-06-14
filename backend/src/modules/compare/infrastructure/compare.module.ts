import { Module } from '@nestjs/common';
import { COMPARE_REPO } from '../../../common/tokens.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { CompareController } from './compare.controller.js';
import { makeCompareRepo } from './compare.repo.js';

@Module({
  providers: [
    {
      provide: COMPARE_REPO,
      useFactory: (prisma: PrismaService) => makeCompareRepo(prisma),
      inject: [PrismaService],
    },
  ],
  controllers: [CompareController],
})
export class CompareModule {}
