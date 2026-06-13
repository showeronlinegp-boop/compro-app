import { Module } from '@nestjs/common';
import { SHOPPING_REPO } from '../../../common/tokens.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { ShoppingController } from './shopping.controller.js';
import { makeShoppingRepo } from './shopping.repo.js';

@Module({
  providers: [
    {
      provide: SHOPPING_REPO,
      useFactory: (prisma: PrismaService) => makeShoppingRepo(prisma),
      inject: [PrismaService],
    },
  ],
  controllers: [ShoppingController],
})
export class ShoppingModule {}
