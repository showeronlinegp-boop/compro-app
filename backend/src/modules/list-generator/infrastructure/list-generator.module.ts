import { Module } from '@nestjs/common';
import { LIST_GEN_SERVICE } from '../../../common/tokens.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { makeListGeneratorRepo } from './list-generator.repo.js';
import { makeListGeneratorService } from './list-generator.service.js';

export type { ListGeneratorService } from './list-generator.service.js';

@Module({
  providers: [
    {
      provide: LIST_GEN_SERVICE,
      useFactory: (prisma: PrismaService) => {
        const repo = makeListGeneratorRepo(prisma);
        return makeListGeneratorService(repo);
      },
      inject: [PrismaService],
    },
  ],
  exports: [LIST_GEN_SERVICE],
})
export class ListGeneratorModule {}
