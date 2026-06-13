/**
 * exception-filter.e2e.test.ts — HTTP tests for AllExceptionsFilter.
 *
 * Spec coverage:
 *   - Route throwing NotFoundException → 404 with { error: "..." }
 *   - Route throwing a plain Error → 500 with { error: "Internal server error" }
 *
 * Uses a minimal NestJS app with a test-only controller (does not import AppModule
 * to avoid spinning up all 6 feature modules + DB for this unit concern).
 * The filter itself is what we're testing — any lightweight host module works.
 *
 * Uses @nestjs/testing + supertest.
 * DATABASE_URL is set to compro_test by global-setup before modules load.
 */

import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Controller, Get, Module, NotFoundException } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AllExceptionsFilter } from '../../common/all-exceptions.filter.js';

// Test-only controller — declares two routes that throw predictable errors
@Controller('test-errors')
class ErrorTestController {
  @Get('not-found')
  throwNotFound(): never {
    throw new NotFoundException('Product not found');
  }

  @Get('internal')
  throwInternal(): never {
    throw new Error('DB connection lost');
  }
}

@Module({ controllers: [ErrorTestController] })
class ErrorTestModule {}

let app: INestApplication;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [ErrorTestModule],
  }).compile();

  app = moduleRef.createNestApplication<NestExpressApplication>();
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
}, 15_000);

afterAll(async () => {
  await app.close();
});

describe('AllExceptionsFilter', () => {
  it('maps NotFoundException to 404 with { error } body', async () => {
    const res = await request(app.getHttpServer()).get('/test-errors/not-found');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
    expect(typeof res.body.error).toBe('string');
    expect(res.body.error).toContain('Product not found');
  });

  it('maps unknown Error to 500 with { error: "Internal server error" }', async () => {
    const res = await request(app.getHttpServer()).get('/test-errors/internal');
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toBe('Internal server error');
  });
});
