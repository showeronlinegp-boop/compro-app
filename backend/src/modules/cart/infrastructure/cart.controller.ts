import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CART_REPO } from '../../../common/tokens.js';
import type { CartRepo } from './cart.repo.js';

@Controller('api/cart')
export class CartController {
  constructor(@Inject(CART_REPO) private readonly repo: CartRepo) {}

  @Get()
  getCart() {
    return this.repo.getOrCreate();
  }

  @Post('items')
  async addItem(
    @Body() body: { product_id?: unknown; quantity?: unknown },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { product_id, quantity = 1 } = body;

    const pid = Number(product_id);
    if (!product_id || !Number.isInteger(pid) || pid < 1) {
      res.status(400);
      return { error: 'product_id debe ser un entero positivo' };
    }

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      res.status(400);
      return { error: 'quantity debe ser al menos 1' };
    }

    try {
      res.status(201);
      return await this.repo.addItem(pid, qty);
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      if (e.statusCode === 404) {
        res.status(404);
        return { error: e.message };
      }
      if (e.statusCode === 400) {
        res.status(400);
        return { error: e.message };
      }
      throw err;
    }
  }

  @Put('items/:id')
  async updateQty(
    @Param('id') id: string,
    @Body() body: { quantity?: unknown },
    @Res({ passthrough: true }) res: Response,
  ) {
    const qty = Number(body.quantity);
    if (!body.quantity || !Number.isInteger(qty) || qty < 1) {
      res.status(400);
      return { error: 'quantity debe ser al menos 1' };
    }

    try {
      return await this.repo.updateQty(Number(id), qty);
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      if (e.statusCode === 404) {
        res.status(404);
        return { error: e.message };
      }
      if (e.statusCode === 400) {
        res.status(400);
        return { error: e.message };
      }
      throw err;
    }
  }

  @Delete('items/:id')
  async removeItem(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    try {
      return await this.repo.removeItem(Number(id));
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      if (e.statusCode === 404) {
        res.status(404);
        return { error: e.message };
      }
      throw err;
    }
  }

  @Delete()
  clearCart() {
    return this.repo.clear();
  }
}
