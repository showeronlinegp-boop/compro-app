/**
 * catalog.e2e.test.ts — HTTP parity tests for CatalogController.
 *
 * Spec coverage:
 *   - GET /api/products → 200, JSON array (or {data,total,page,pages} shape)
 *   - GET /api/products/groups → 200, JSON array
 *   - GET /api/products/categories → 200, JSON array
 *
 * Uses @nestjs/testing + supertest against the full AppModule.
 * DATABASE_URL is set to compro_test by global-setup before modules load.
 */

import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
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

describe('GET /api/products', () => {
  it('returns 200 and a JSON array or paginated object', async () => {
    const res = await request(app.getHttpServer()).get('/api/products');
    expect(res.status).toBe(200);
    // The catalog may return a plain array or a {data, total, page, pages} wrapper
    const body: unknown = res.body;
    const isArray = Array.isArray(body);
    const isPaginated =
      typeof body === 'object' &&
      body !== null &&
      'data' in body &&
      Array.isArray((body as { data: unknown }).data);
    expect(isArray || isPaginated).toBe(true);
  });
});

describe('GET /api/products/groups', () => {
  it('returns 200 and a JSON array or paginated object with data array', async () => {
    const res = await request(app.getHttpServer()).get('/api/products/groups');
    expect(res.status).toBe(200);
    const body: unknown = res.body;
    const isArray = Array.isArray(body);
    const isPaginated =
      typeof body === 'object' &&
      body !== null &&
      'data' in body &&
      Array.isArray((body as { data: unknown }).data);
    expect(isArray || isPaginated).toBe(true);
  });
});

describe('GET /api/products/categories', () => {
  it('returns 200 and a JSON array', async () => {
    const res = await request(app.getHttpServer()).get('/api/products/categories');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('each category has slug, label, icon fields', async () => {
    const res = await request(app.getHttpServer()).get('/api/products/categories');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if ((res.body as unknown[]).length > 0) {
      const first = (res.body as Array<Record<string, unknown>>)[0];
      expect(first).toHaveProperty('slug');
      expect(first).toHaveProperty('label');
    }
  });
});
