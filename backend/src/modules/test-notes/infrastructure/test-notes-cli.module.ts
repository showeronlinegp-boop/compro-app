import { Module } from '@nestjs/common';
import { TEST_NOTES_ADMIN_REPO } from '../../../common/tokens.js';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { makeTestNotesAdminRepo } from './test-notes.repo.js';

/**
 * Contexto Nest mínimo para el CLI de notas (`npm run notes`): solo Prisma y el
 * repo admin (sin usuario ni request). No levanta AppModule, así que no arranca
 * el scheduler ni el crawler.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: TEST_NOTES_ADMIN_REPO,
      useFactory: (prisma: PrismaService) => makeTestNotesAdminRepo(prisma),
      inject: [PrismaService],
    },
  ],
  exports: [TEST_NOTES_ADMIN_REPO],
})
export class TestNotesCliModule {}
