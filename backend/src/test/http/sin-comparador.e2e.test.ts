/**
 * sin-comparador.e2e.test.ts — arranque de producción: sin ENABLE_COMPARADOR
 * sólo quedan Fiado y el healthcheck; compras, crawler y crons no se montan.
 */

import 'reflect-metadata';
import { vi } from 'vitest';

vi.mock('@clerk/backend', () => ({ verifyToken: vi.fn() }));

import { verifyToken } from '@clerk/backend';
import { type INestApplication, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appImports } from '../../app.module.js';
import { AllExceptionsFilter } from '../../common/all-exceptions.filter.js';
import { SchedulerService } from '../../scheduler/scheduler.service.js';
import { TEST_AUTH_HEADER, setupClerkMock } from '../helpers/auth-mock.js';

@Module({
  imports: appImports(false),
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class AppSinComparador {}

let app: INestApplication;
const api = () => request(app.getHttpServer());

beforeAll(async () => {
  setupClerkMock(vi.mocked(verifyToken));
  const moduleRef = await Test.createTestingModule({ imports: [AppSinComparador] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
}, 30_000);

afterAll(async () => {
  await app.close();
});

describe('AppModule sin comparador', () => {
  it('el healthcheck responde sin sesión', async () => {
    const res = await api().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('Fiado sigue funcionando', async () => {
    const res = await api().get('/api/fiado/resumen').set(...TEST_AUTH_HEADER);
    expect(res.status).toBe(200);
  });

  it.each([
    '/api/products',
    '/api/sync/status',
    '/api/compare',
    '/api/promos',
    '/api/interests',
    '/api/cart',
    '/api/profile',
    '/api/shopping',
    '/api/enrich',
  ])('%s no existe', async (path) => {
    const res = await api().get(path).set(...TEST_AUTH_HEADER);
    expect(res.status).toBe(404);
  });

  it('no registra los crons de sync', () => {
    expect(() => app.get(SchedulerService, { strict: false })).toThrow();
  });
});
