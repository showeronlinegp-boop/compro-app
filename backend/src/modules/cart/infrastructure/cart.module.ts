import { Module, Scope } from '@nestjs/common';
import { CART_REPO, COMPARE_REPO } from '../../../common/tokens.js';
import { CurrentUserService } from '../../../common/auth/current-user.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { CompareModule } from '../../compare/infrastructure/compare.module.js';
import type { CompareRepo } from '../../compare/infrastructure/compare.repo.js';
import { CartController } from './cart.controller.js';
import { makeCartRepo } from './cart.repo.js';

@Module({
  imports: [CompareModule],
  providers: [
    {
      provide: CART_REPO,
      scope: Scope.REQUEST,
      useFactory: (prisma: PrismaService, compareRepo: CompareRepo, currentUser: CurrentUserService) =>
        makeCartRepo(prisma, compareRepo, () => currentUser.userId),
      inject: [PrismaService, COMPARE_REPO, CurrentUserService],
    },
  ],
  controllers: [CartController],
})
export class CartModule {}
