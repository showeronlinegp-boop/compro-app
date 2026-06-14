import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { CART_REPO } from '../../../common/tokens.js';
import { makeCartRepo } from './cart.repo.js';
import { CartController } from './cart.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [CartController],
  providers: [
    {
      provide: CART_REPO,
      useFactory: (prisma: PrismaService) => makeCartRepo(prisma),
      inject: [PrismaService],
    },
  ],
})
export class CartModule {}
