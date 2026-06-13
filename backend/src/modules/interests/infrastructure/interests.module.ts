import { Module } from '@nestjs/common';
import { INTERESTS_REPO } from '../../../common/tokens.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { InterestsController } from './interests.controller.js';
import { makeInterestsRepo } from './interests.repo.js';

@Module({
  providers: [
    {
      provide: INTERESTS_REPO,
      useFactory: (prisma: PrismaService) => makeInterestsRepo(prisma),
      inject: [PrismaService],
    },
  ],
  controllers: [InterestsController],
})
export class InterestsModule {}
