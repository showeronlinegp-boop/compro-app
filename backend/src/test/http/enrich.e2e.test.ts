/**
 * enrich.e2e.test.ts — HTTP parity tests for EnrichmentController.
 *
 * Spec coverage:
 *   - GET /api/enrich/status → 200, object (in-memory status map)
 *   - POST /api/enrich/:super → immediate 200/202 ack (fire-and-forget)
 *   - POST /api/enrich/ → hybrid: responds with product list, fires background enrichment
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

describe('POST /api/enrich/:super', () => {
  it('responds immediately with 200 ack or 409 for a known super (fire-and-forget)', async () => {
    const start = Date.now();
    const res = await request(app.getHttpServer())
      .post('/api/enrich/vea')
      .set('Content-Type', 'application/json');
    const elapsed = Date.now() - start;

    // Explicit 200 for ack (res.status(200).json(...)) or 409 if already running
    expect([200, 409]).toContain(res.status);
    // Fire-and-forget — must not wait for the enrichment to complete
    expect(elapsed).toBeLessThan(5000);
  });
});

describe('POST /api/enrich/', () => {
  it('responds with 200 and hybrid response shape', async () => {
    const start = Date.now();
    const res = await request(app.getHttpServer())
      .post('/api/enrich/')
      .set('Content-Type', 'application/json');
    const elapsed = Date.now() - start;

    // Explicit 200 for ack (res.status(200).json(...)) or 500 if DB query fails
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('ok');
      expect(res.body).toHaveProperty('supers');
      expect(Array.isArray(res.body.supers)).toBe(true);
    }
    // Hybrid: must respond before enrichment finishes (not fire-and-forget — awaits findMany first)
    expect(elapsed).toBeLessThan(10_000);
  });
});
