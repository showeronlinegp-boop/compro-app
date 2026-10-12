/**
 * enrich.e2e.test.ts — HTTP parity tests for EnrichmentController.
 *
 * PR2 removed all operational POST triggers from HTTP. Only GET /api/enrich/status
 * remains. The POST endpoints (/api/enrich/:super, /api/enrich/) now return 404
 * because the routes were deleted.
 *
 * Spec coverage:
 *   - GET /api/enrich/status → 200, object (in-memory status map)
 *   - POST /api/enrich/:super → 404 (endpoint removed; use ops CLI)
 *   - POST /api/enrich/ → 404 (endpoint removed; use ops CLI)
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

describe('GET /api/enrich/status', () => {
  it('returns 200 and a plain object keyed by super (NOT an array)', async () => {
    const res = await request(app.getHttpServer()).get('/api/enrich/status');
    expect(res.status).toBe(200);
    // getStatus() returns Record<string, EnrichStatus> — an object keyed by super, not an array
    expect(typeof res.body === 'object' && res.body !== null && !Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/enrich/:super — REMOVED in PR2', () => {
  it('returns 404 (operational HTTP trigger removed; use ops CLI)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/enrich/vea')
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/enrich/ — REMOVED in PR2', () => {
  it('returns 404 (operational HTTP trigger removed; use ops CLI)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/enrich/')
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(404);
  });
});
