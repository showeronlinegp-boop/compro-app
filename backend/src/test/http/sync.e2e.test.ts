/**
 * sync.e2e.test.ts — HTTP parity tests for CrawlerController.
 *
 * PR2 removed all operational POST triggers from HTTP. Only GET /api/sync/status
 * remains. The POST endpoints (/api/sync/all, /api/sync/:super) now return 404
 * because the routes were deleted.
 *
 * Spec coverage (critical regression guard):
 *   - GET /api/sync/status → 200 + Array.isArray(body) === true (NOT an object)
 *   - POST /api/sync/all → 404 (endpoint removed; use ops CLI)
 *   - POST /api/sync/:super → 404 (endpoint removed; use ops CLI)
 *
 * The /api/sync/status ARRAY assertion is the white-screen regression guard.
 * The previous Express implementation returned {} (an empty object) which caused
 * the white-screen bug. This test explicitly fails if an object is returned.
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

describe('GET /api/sync/status — REGRESSION GUARD', () => {
  it('returns 200 and an ARRAY (not an object — critical regression guard)', async () => {
    const res = await request(app.getHttpServer()).get('/api/sync/status');
    expect(res.status).toBe(200);

    // CRITICAL: must be an array, NOT {} or any non-array value
    // The old Express implementation returned {} which caused the white-screen bug
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('is NOT an empty object {}', async () => {
    const res = await request(app.getHttpServer()).get('/api/sync/status');
    expect(res.status).toBe(200);
    // Explicitly verify the body is not a plain object
    expect(typeof res.body === 'object' && !Array.isArray(res.body)).toBe(false);
  });
});

describe('POST /api/sync/all — REMOVED in PR2', () => {
  it('returns 404 (operational HTTP trigger removed; use ops CLI)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/sync/all')
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/sync/:super — REMOVED in PR2', () => {
  it('returns 404 for any super (operational HTTP trigger removed; use ops CLI)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/sync/vea')
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(404);
  });
});
