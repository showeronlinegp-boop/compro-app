import { Module } from '@nestjs/common';
import { AdminGuard } from '../../../common/auth/admin.guard.js';
import { ADMIN_IDS, CLERK_INGRESOS, USO_REPO } from '../../../common/tokens.js';
import {
  ADMIN_CLERK_USER_IDS,
  CLERK_SECRET_KEY,
  METRICAS_EXCLUIR_CLERK_USER_IDS,
} from '../../../config/env.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AdminController } from './admin.controller.js';
import { makeClerkIngresos } from './clerk-ingresos.js';
import { makeUsoRepo } from './uso.repo.js';

@Module({
  providers: [
    { provide: ADMIN_IDS, useValue: ADMIN_CLERK_USER_IDS },
    AdminGuard,
    {
      provide: USO_REPO,
      // Los admins no cuentan en las métricas: sus cuentas son de prueba.
      useFactory: (prisma: PrismaService, admins: readonly string[]) =>
        makeUsoRepo(prisma, [...admins, ...METRICAS_EXCLUIR_CLERK_USER_IDS]),
      inject: [PrismaService, ADMIN_IDS],
    },
    { provide: CLERK_INGRESOS, useFactory: () => makeClerkIngresos(CLERK_SECRET_KEY) },
  ],
  controllers: [AdminController],
})
export class AdminModule {}
