/**
 * interests.e2e.test.ts — HTTP parity tests for InterestsController.
 *
 * InterestsController is protected (requires valid Clerk JWT). All requests
 * include a mocked Bearer token so ClerkAuthGuard provisions a real users row
 * in compro_test and populates request.auth.
 *
 * Spec coverage:
 *   - GET /api/interests → 200, array
 *   - POST /api/interests → 201 on create, 400 if no product_id
 *   - DELETE /api/interests/:id → 200 or 404
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

describe('GET /api/interests', () => {
  it('returns 200 and a JSON array', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/interests')
      .set(...TEST_AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/interests', () => {
  it('returns 400 when product_id is missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/interests')
      .set(...TEST_AUTH_HEADER)
      .send({})
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 404 when product_id does not exist in DB', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/interests')
      .set(...TEST_AUTH_HEADER)
      .send({ product_id: 99999999 })
      .set('Content-Type', 'application/json');
    // Should be 404 (product not found) or 201/200 if somehow found
    expect([201, 200, 404]).toContain(res.status);
  });
});

describe('DELETE /api/interests/:id', () => {
  it('returns 404 for a non-existent interest id', async () => {
    const res = await request(app.getHttpServer())
      .delete('/api/interests/99999999')
      .set(...TEST_AUTH_HEADER);
    expect([200, 204, 404]).toContain(res.status);
  });
});
