/**
 * promos.e2e.test.ts — HTTP parity tests for PromosController.
 *
 * Spec coverage:
 *   - GET /api/promos → 200, array
 *   - POST /api/promos/capture → 200 or 202, immediate response (fire-and-forget)
 *   - POST /api/promos/capture/:super → 200 or 202, immediate response
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

describe('POST /api/promos/capture', () => {
  it('responds immediately with 200 ack or 409 (fire-and-forget)', async () => {
    const start = Date.now();
    const res = await request(app.getHttpServer())
      .post('/api/promos/capture')
      .set('Content-Type', 'application/json');
    const elapsed = Date.now() - start;

    // Explicit 200 for ack (res.status(200).json(...)) or 409 if already running
    expect([200, 409]).toContain(res.status);
    // Must respond quickly (fire-and-forget — not waiting for background capture)
    expect(elapsed).toBeLessThan(5000);
  });
});

describe('POST /api/promos/capture/:super', () => {
  it('responds immediately with 200 ack or 409 for a known super', async () => {
    const start = Date.now();
    const res = await request(app.getHttpServer())
      .post('/api/promos/capture/vea')
      .set('Content-Type', 'application/json');
    const elapsed = Date.now() - start;

    // Explicit 200 for ack (res.status(200).json(...)) or 409 if already running
    expect([200, 409]).toContain(res.status);
    expect(elapsed).toBeLessThan(5000);
  });
});
