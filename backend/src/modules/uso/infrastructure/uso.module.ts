import { Module, Scope } from '@nestjs/common';
import { CurrentUserService } from '../../../common/auth/current-user.service.js';
import { USO_EVENTOS_REPO } from '../../../common/tokens.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { makeUsoEventosRepo } from './uso-eventos.repo.js';
import { UsoRetencionService } from './uso-retencion.service.js';
import { UsoController } from './uso.controller.js';

@Module({
  providers: [
    {
      provide: USO_EVENTOS_REPO,
      scope: Scope.REQUEST,
      useFactory: (prisma: PrismaService, currentUser: CurrentUserService) =>
        makeUsoEventosRepo(prisma, () => currentUser.userId),
      inject: [PrismaService, CurrentUserService],
    },
    UsoRetencionService,
  ],
  controllers: [UsoController],
})
export class UsoModule {}
