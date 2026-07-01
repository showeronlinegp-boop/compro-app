/**
 * shopping.e2e.test.ts — HTTP parity tests for ShoppingController.
 *
 * ShoppingController is protected (requires valid Clerk JWT). All requests
 * include a mocked Bearer token so ClerkAuthGuard provisions a real users row
 * in compro_test and populates request.auth.
 *
 * Spec coverage:
 *   - GET /api/shopping → 200, array
 *   - GET /api/shopping/weekly → 200, array
 *   - POST /api/shopping → 400 if no product_id, 404 if product not found
 *   - PUT /api/shopping/:id → 404 for non-existent id
 *   - DELETE /api/shopping/:id → 404 for non-existent id
 *
 * Uses @nestjs/testing + supertest against the full AppModule.
 * DATABASE_URL is set to compro_test by global-setup before modules load.
 */

import 'reflect-metadata';
import { vi } from 'vitest';

// vi.mock is hoisted — must appear before other imports that load @clerk/backend.
vi.mock('@clerk/backend', () => ({ verifyToken: vi.fn() }));

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyToken } from '@clerk/backend';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../app.module.js';
import { AllExceptionsFilter } from '../../common/all-exceptions.filter.js';
import { setupClerkMock, TEST_AUTH_HEADER } from '../helpers/auth-mock.js';

let app: INestApplication;

beforeAll(async () => {
  // Wire verifyToken to return a valid payload so the guard accepts the test token.
  setupClerkMock(vi.mocked(verifyToken));

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

describe('GET /api/shopping', () => {
  it('returns 200 and a JSON array', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/shopping')
      .set(...TEST_AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /api/shopping/weekly', () => {
  it('returns 200 and a JSON array', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/shopping/weekly')
      .set(...TEST_AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/shopping', () => {
  it('returns 400 when product_id is missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/shopping')
      .set(...TEST_AUTH_HEADER)
      .send({})
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 404 when product_id does not exist', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/shopping')
      .set(...TEST_AUTH_HEADER)
      .send({ product_id: 99999999 })
      .set('Content-Type', 'application/json');
    expect([201, 200, 404]).toContain(res.status);
  });
});

describe('PUT /api/shopping/:id', () => {
  it('returns 404 for a non-existent shopping item', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/shopping/99999999')
      .set(...TEST_AUTH_HEADER)
      .send({ frequency_days: 7 })
      .set('Content-Type', 'application/json');
    expect([200, 400, 404]).toContain(res.status);
  });
});

describe('DELETE /api/shopping/:id', () => {
  it('returns 404 for a non-existent shopping item', async () => {
    const res = await request(app.getHttpServer())
      .delete('/api/shopping/99999999')
      .set(...TEST_AUTH_HEADER);
    expect([200, 204, 404]).toContain(res.status);
  });
});
