import { Controller, Get, Inject } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { COMPARE_REPO } from '../../../common/tokens.js';
import { buildCompareResult } from '../domain/matcher.js';
import type { CompareRepo } from './compare.repo.js';

@Controller('api/compare')
export class CompareController {
  constructor(@Inject(COMPARE_REPO) private readonly repo: CompareRepo) {}

  // pg_trgm similarity is expensive — stricter rate limit than the global 100/min.
  @Throttle({ global: { ttl: 60_000, limit: 20 } })
  @Get()
  async compare() {
    const items = await this.repo.buildCompareItems();
    return buildCompareResult(items);
  }
}
