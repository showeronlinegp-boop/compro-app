import { Module } from '@nestjs/common';
import { AdminGuard } from '../../../common/auth/admin.guard.js';
import { ADMIN_IDS, TUTORIALES_REPO } from '../../../common/tokens.js';
import { ADMIN_CLERK_USER_IDS } from '../../../config/env.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { TutorialesAdminController, TutorialesController } from './tutoriales.controller.js';
import { makeTutorialesRepo } from './tutoriales.repo.js';

@Module({
  providers: [
    { provide: ADMIN_IDS, useValue: ADMIN_CLERK_USER_IDS },
    AdminGuard,
    {
      provide: TUTORIALES_REPO,
      useFactory: (prisma: PrismaService) => makeTutorialesRepo(prisma),
      inject: [PrismaService],
    },
  ],
  controllers: [TutorialesController, TutorialesAdminController],
})
export class TutorialesModule {}
