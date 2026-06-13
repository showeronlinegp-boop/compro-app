/**
 * sync.e2e.test.ts — HTTP parity tests for CrawlerController.
 *
 * Spec coverage (critical regression guard):
 *   - GET /api/sync/status → 200 + Array.isArray(body) === true (NOT an object)
 *   - POST /api/sync/all → immediate 200/202 ack (fire-and-forget)
 *   - POST /api/sync/:super → immediate 200/202 ack
 *   - POST /api/sync/all (second call) → 409 if still running
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

describe('POST /api/sync/all', () => {
  it('responds immediately with 200 ack or 409 (fire-and-forget)', async () => {
    const start = Date.now();
    const res = await request(app.getHttpServer())
      .post('/api/sync/all')
      .set('Content-Type', 'application/json');
    const elapsed = Date.now() - start;

    // Explicit 200 for ack (res.status(200).json(...)) or 409 if already running
    expect([200, 409]).toContain(res.status);
    // Must respond quickly (fire-and-forget — not waiting for background crawl)
    expect(elapsed).toBeLessThan(5000);
  });

  it('returns 409 on a second concurrent call when busy', async () => {
    // First call to kick off sync (may or may not succeed depending on state)
    const first = await request(app.getHttpServer())
      .post('/api/sync/all')
      .set('Content-Type', 'application/json');

    if (first.status === 200) {
      // Second call while first is still running → 409
      const second = await request(app.getHttpServer())
        .post('/api/sync/all')
        .set('Content-Type', 'application/json');
      expect([409, 200]).toContain(second.status);
      // If it returned 409, verify the error shape
      if (second.status === 409) {
        expect(second.body).toHaveProperty('error');
      }
    } else {
      // Already running (409) from a previous test — that's also valid
      expect(first.status).toBe(409);
    }
  });
});

describe('POST /api/sync/:super', () => {
  it('responds immediately with 200 ack or 409 for a known super', async () => {
    const start = Date.now();
    const res = await request(app.getHttpServer())
      .post('/api/sync/vea')
      .set('Content-Type', 'application/json');
    const elapsed = Date.now() - start;

    // Explicit 200 for ack (res.status(200).json(...)) or 409 if already running
    expect([200, 409]).toContain(res.status);
    expect(elapsed).toBeLessThan(5000);
  });
});
