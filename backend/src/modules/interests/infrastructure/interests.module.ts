import { Module, Scope } from '@nestjs/common';
import { INTERESTS_REPO } from '../../../common/tokens.js';
import { CurrentUserService } from '../../../common/auth/current-user.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { InterestsController } from './interests.controller.js';
import { makeInterestsRepo } from './interests.repo.js';

@Module({
  providers: [
    {
      provide: INTERESTS_REPO,
      scope: Scope.REQUEST,
      useFactory: (prisma: PrismaService, currentUser: CurrentUserService) =>
        makeInterestsRepo(prisma, currentUser.userId),
      inject: [PrismaService, CurrentUserService],
    },
  ],
  controllers: [InterestsController],
})
export class InterestsModule {}
