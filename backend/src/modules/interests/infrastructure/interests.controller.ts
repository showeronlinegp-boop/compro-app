import { Body, Controller, Delete, HttpCode, Inject, Param, Post, Get } from '@nestjs/common';
import type { Response } from 'express';
import { Res } from '@nestjs/common';
import { INTERESTS_REPO } from '../../../common/tokens.js';
import type { InterestsRepo } from './interests.repo.js';

@Controller('api/interests')
export class InterestsController {
  constructor(@Inject(INTERESTS_REPO) private readonly repo: InterestsRepo) {}

  @Get()
  list() {
    return this.repo.list();
  }

  @Post()
  async create(@Body() body: { product_id?: unknown }, @Res({ passthrough: true }) res: Response) {
    const { product_id } = body;
    if (!product_id) {
      res.status(400);
      return { error: 'product_id requerido' };
    }

    try {
      const result = await this.repo.create(Number(product_id));
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
