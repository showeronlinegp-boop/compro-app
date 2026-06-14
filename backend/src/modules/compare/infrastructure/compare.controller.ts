import { Controller, Get, Inject } from '@nestjs/common';
import { COMPARE_REPO } from '../../../common/tokens.js';
import { buildCompareResult } from '../domain/matcher.js';
import type { CompareRepo } from './compare.repo.js';

@Controller('api/shopping')
export class CompareController {
  constructor(@Inject(COMPARE_REPO) private readonly repo: CompareRepo) {}

  @Get('compare')
  async compare() {
    const items = await this.repo.buildCompareItems();
    return buildCompareResult(items);
  }
}
