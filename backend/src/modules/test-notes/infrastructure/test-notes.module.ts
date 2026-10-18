import { Module, Scope } from '@nestjs/common';
import { CurrentUserService } from '../../../common/auth/current-user.service.js';
import { TEST_NOTES_REPO } from '../../../common/tokens.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { TestNotesController } from './test-notes.controller.js';
import { makeTestNotesRepo } from './test-notes.repo.js';

/**
 * Notas de prueba (herramienta de desarrollo local). Se registra en AppModule
 * solo con TEST_NOTES_ENABLED=1: sin la flag, /api/test-notes no existe (404).
 *
 * El repo es request-scoped únicamente para fijar el AUTOR al crear; las
 * lecturas y escrituras no filtran por usuario (notas compartidas, P1).
 */
@Module({
  providers: [
    {
      provide: TEST_NOTES_REPO,
      scope: Scope.REQUEST,
      useFactory: (prisma: PrismaService, currentUser: CurrentUserService) =>
        makeTestNotesRepo(prisma, () => currentUser.userId),
      inject: [PrismaService, CurrentUserService],
    },
  ],
  controllers: [TestNotesController],
})
export class TestNotesModule {}
