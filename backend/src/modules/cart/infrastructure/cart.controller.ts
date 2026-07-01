import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CART_REPO } from '../../../common/tokens.js';
import type { CartRepo } from './cart.repo.js';

// ─── Validation helpers ───────────────────────────────────────────────────────

function parsePositiveInt(value: unknown, label: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    const err = Object.assign(new Error(`${label} inválido`), { statusCode: 400 });
    throw err;
  }
  return n;
}

function parseQuantity(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 999) {
    const err = Object.assign(
      new Error('quantity debe ser un entero entre 1 y 999'),
      { statusCode: 400 },
    );
    throw err;
  }
  return n;
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('api/cart')
export class CartController {
  constructor(@Inject(CART_REPO) private readonly repo: CartRepo) {}

  // ─── Private error handler ──────────────────────────────────────────────────

  private handleRepoError(err: unknown, res: Response): { error: string } | never {
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

  // ─── Routes ─────────────────────────────────────────────────────────────────

  @Get()
  getCart() {
    return this.repo.getOrCreate();
  }

  // pg_trgm similarity is expensive — stricter rate limit than the global 100/min.
  @Throttle({ global: { ttl: 60_000, limit: 20 } })
  @Get('compare')
  compareCart() {
    return this.repo.compareCart();
  }

  @Post('items')
  async addItem(
    @Body() body: { product_id?: unknown; quantity?: unknown },
    @Res({ passthrough: true }) res: Response,
  ) {
    let pid: number;
    try {
      pid = parsePositiveInt(body.product_id, 'product_id');
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      res.status(400);
      return { error: e.message };
    }

    const rawQty = body.quantity === undefined ? 1 : body.quantity;
    let qty: number;
    try {
      qty = parseQuantity(rawQty);
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      res.status(400);
      return { error: e.message };
    }

    try {
      res.status(201);
      return await this.repo.addItem(pid, qty);
    } catch (err) {
      return this.handleRepoError(err, res);
    }
  }

  @Put('items/:id')
  async updateQty(
    @Param('id') id: string,
    @Body() body: { quantity?: unknown },
    @Res({ passthrough: true }) res: Response,
  ) {
    let itemId: number;
    try {
      itemId = parsePositiveInt(id, 'id');
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      res.status(400);
      return { error: e.message };
    }

    let qty: number;
    try {
      qty = parseQuantity(body.quantity);
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      res.status(400);
      return { error: e.message };
    }

    try {
      return await this.repo.updateQty(itemId, qty);
    } catch (err) {
      return this.handleRepoError(err, res);
    }
  }

  @Delete('items/:id')
  async removeItem(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    let itemId: number;
    try {
      itemId = parsePositiveInt(id, 'id');
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      res.status(400);
      return { error: e.message };
    }

    try {
      return await this.repo.removeItem(itemId);
    } catch (err) {
      return this.handleRepoError(err, res);
    }
  }

  @Delete()
  clearCart() {
    return this.repo.clear();
  }
}
