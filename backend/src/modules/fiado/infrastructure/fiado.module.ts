import { Module, Scope } from '@nestjs/common';
import { CurrentUserService } from '../../../common/auth/current-user.service.js';
import { FIADO_REPO } from '../../../common/tokens.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { FiadoController } from './fiado.controller.js';
import { makeFiadoRepo } from './fiado.repo.js';

@Module({
  providers: [
    {
      provide: FIADO_REPO,
      scope: Scope.REQUEST,
      useFactory: (prisma: PrismaService, currentUser: CurrentUserService) =>
        makeFiadoRepo(prisma, () => currentUser.userId),
      inject: [PrismaService, CurrentUserService],
    },
  ],
  controllers: [FiadoController],
})
export class FiadoModule {}
