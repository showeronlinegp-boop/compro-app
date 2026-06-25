import { Module } from '@nestjs/common';
import { CART_REPO } from '../../../common/tokens.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { CartController } from './cart.controller.js';
import { makeCartRepo } from './cart.repo.js';

@Module({
  providers: [
    {
      provide: CART_REPO,
      useFactory: (prisma: PrismaService) => makeCartRepo(prisma),
      inject: [PrismaService],
    },
  ],
  controllers: [CartController],
})
export class CartModule {}
