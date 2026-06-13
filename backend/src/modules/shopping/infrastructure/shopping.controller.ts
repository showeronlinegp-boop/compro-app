import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SHOPPING_REPO } from '../../../common/tokens.js';
import type { ShoppingRepo } from './shopping.repo.js';

@Controller('api/shopping')
export class ShoppingController {
  constructor(@Inject(SHOPPING_REPO) private readonly repo: ShoppingRepo) {}

  @Get()
  list() {
    return this.repo.list();
  }

  @Get('weekly')
  listWeekly() {
    return this.repo.listWeekly();
  }

  @Post()
  async create(
    @Body()
    body: {
      product_id?: unknown;
      frequency_days?: unknown;
      notes?: unknown;
    },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { product_id, frequency_days = 7, notes = '' } = body;

    if (!product_id) {
      res.status(400);
      return { error: 'product_id requerido' };
    }

    try {
      const result = await this.repo.create({
        product_id: Number(product_id),
        frequency_days: Number(frequency_days),
        notes: String(notes),
      });
      if (result.already) {
        res.status(200);
        return result;
      }
      res.status(201);
      return result;
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      if (e.statusCode === 404) {
        res.status(404);
        return { error: e.message };
      }
      throw err;
    }
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { frequency_days?: unknown; last_bought?: unknown; notes?: unknown },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { frequency_days, last_bought, notes } = body;

    try {
      return await this.repo.update(Number(id), {
        frequency_days: frequency_days != null ? Number(frequency_days) : undefined,
        last_bought: last_bought !== undefined ? (last_bought as string | null) : undefined,
        notes: notes !== undefined ? String(notes) : undefined,
      });
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

  @Delete(':id')
  async remove(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    try {
      return await this.repo.remove(Number(id));
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      if (e.statusCode === 404) {
        res.status(404);
        return { error: e.message };
      }
      throw err;
    }
  }
}
