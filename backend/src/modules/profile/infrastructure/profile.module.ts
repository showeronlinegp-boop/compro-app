import { Module, Scope } from '@nestjs/common';
import { PROFILE_REPO } from '../../../common/tokens.js';
import { CurrentUserService } from '../../../common/auth/current-user.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { ListGeneratorModule } from '../../list-generator/infrastructure/list-generator.module.js';
import { ProfileController } from './profile.controller.js';
import { makeProfileRepo } from './profile.repo.js';

@Module({
  imports: [ListGeneratorModule],
  providers: [
    {
      provide: PROFILE_REPO,
      scope: Scope.REQUEST,
      useFactory: (prisma: PrismaService, currentUser: CurrentUserService) =>
        makeProfileRepo(prisma, currentUser.userId),
      inject: [PrismaService, CurrentUserService],
    },
  ],
  controllers: [ProfileController],
})
export class ProfileModule {}
