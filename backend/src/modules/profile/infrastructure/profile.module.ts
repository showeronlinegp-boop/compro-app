import { Module } from '@nestjs/common';
import { PROFILE_REPO } from '../../../common/tokens.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { ListGeneratorModule } from '../../list-generator/infrastructure/list-generator.module.js';
import { ProfileController } from './profile.controller.js';
import { makeProfileRepo } from './profile.repo.js';

@Module({
  imports: [ListGeneratorModule],
  providers: [
    {
      provide: PROFILE_REPO,
      useFactory: (prisma: PrismaService) => makeProfileRepo(prisma),
      inject: [PrismaService],
    },
  ],
  controllers: [ProfileController],
})
export class ProfileModule {}
