import { Module, Scope } from '@nestjs/common';
import { SHOPPING_REPO } from '../../../common/tokens.js';
import { CurrentUserService } from '../../../common/auth/current-user.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { ShoppingController } from './shopping.controller.js';
import { makeShoppingRepo } from './shopping.repo.js';

@Module({
  providers: [
    {
      provide: SHOPPING_REPO,
      scope: Scope.REQUEST,
      useFactory: (prisma: PrismaService, currentUser: CurrentUserService) =>
        makeShoppingRepo(prisma, () => currentUser.userId),
      inject: [PrismaService, CurrentUserService],
    },
  ],
  controllers: [ShoppingController],
})
export class ShoppingModule {}
