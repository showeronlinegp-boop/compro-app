import { Module } from '@nestjs/common';
import { CART_REPO, COMPARE_REPO } from '../../../common/tokens.js';
import { CompareModule } from '../../compare/infrastructure/compare.module.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { CartController } from './cart.controller.js';
import { makeCartRepo } from './cart.repo.js';
import type { CompareRepo } from '../../compare/infrastructure/compare.repo.js';

@Module({
  imports: [CompareModule],
  providers: [
    {
      provide: CART_REPO,
      useFactory: (prisma: PrismaService, compareRepo: CompareRepo) =>
        makeCartRepo(prisma, compareRepo),
      inject: [PrismaService, COMPARE_REPO],
    },
  ],
  controllers: [CartController],
})
export class CartModule {}
