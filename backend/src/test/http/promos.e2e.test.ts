/**
 * promos.e2e.test.ts — HTTP parity tests for PromosController.
 *
 * PR2 removed all operational POST triggers from HTTP. Only GET /api/promos
 * remains. The POST endpoints (/api/promos/capture, /api/promos/capture/:super)
 * now return 404 because the routes were deleted.
 *
 * Spec coverage:
 *   - GET /api/promos → 200, array
 *   - POST /api/promos/capture → 404 (endpoint removed; use ops CLI)
 *   - POST /api/promos/capture/:super → 404 (endpoint removed; use ops CLI)
 *
 * Uses @nestjs/testing + supertest against the full AppModule.
 * DATABASE_URL is set to compro_test by global-setup before modules load.
 */

import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../app.module.js';
import { AllExceptionsFilter } from '../../common/all-exceptions.filter.js';

let app: INestApplication;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleRef.createNestApplication<NestExpressApplication>();
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
}, 30_000);

afterAll(async () => {
  await app.close();
});

describe('GET /api/promos', () => {
  it('returns 200 and a JSON array', async () => {
    const res = await request(app.getHttpServer()).get('/api/promos');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/promos/capture — REMOVED in PR2', () => {
  it('returns 404 (operational HTTP trigger removed; use ops CLI)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/promos/capture')
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/promos/capture/:super — REMOVED in PR2', () => {
  it('returns 404 (operational HTTP trigger removed; use ops CLI)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/promos/capture/vea')
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(404);
  });
});
