import { Module, Scope } from '@nestjs/common';
import { LIST_GEN_SERVICE } from '../../../common/tokens.js';
import { CurrentUserService } from '../../../common/auth/current-user.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { makeListGeneratorRepo } from './list-generator.repo.js';
import { makeListGeneratorService } from './list-generator.service.js';

export type { ListGeneratorService } from './list-generator.service.js';

@Module({
  providers: [
    {
      provide: LIST_GEN_SERVICE,
      scope: Scope.REQUEST,
      useFactory: (prisma: PrismaService, currentUser: CurrentUserService) => {
        const repo = makeListGeneratorRepo(prisma, () => currentUser.userId);
        return makeListGeneratorService(repo);
      },
      inject: [PrismaService, CurrentUserService],
    },
  ],
  exports: [LIST_GEN_SERVICE],
})
export class ListGeneratorModule {}
