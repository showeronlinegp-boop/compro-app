/**
 * uso.e2e.test.ts — HTTP de POST /api/uso/eventos contra el AppModule completo.
 */

import 'reflect-metadata';
import { vi } from 'vitest';

vi.mock('@clerk/backend', () => ({ verifyToken: vi.fn() }));

import { verifyToken } from '@clerk/backend';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { AllExceptionsFilter } from '../../common/all-exceptions.filter.js';
import { TEST_AUTH_HEADER, TEST_CLERK_USER_ID, setupClerkMock } from '../helpers/auth-mock.js';
import { testPrisma } from '../helpers/test-client.js';

let app: INestApplication;
const api = () => request(app.getHttpServer());

beforeAll(async () => {
  setupClerkMock(vi.mocked(verifyToken));
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
}, 30_000);

afterAll(async () => {
  await app.close();
  await testPrisma.$disconnect();
});

describe('POST /api/uso/eventos', () => {
  it('sin sesión → 401', async () => {
    const res = await api()
      .post('/api/uso/eventos')
      .send({ eventos: [{ evento: 'pantalla', modulo: 'fiado', ruta_id: 'inicio' }] });
    expect(res.status).toBe(401);
  });

  it('lote inválido → 400', async () => {
    const res = await api()
      .post('/api/uso/eventos')
      .set(...TEST_AUTH_HEADER)
      .send({ eventos: [{ evento: 'pantalla', modulo: 'fiado', ruta_id: '/fiado/clientes/3' }] });
    expect(res.status).toBe(400);
  });

  it('con sesión → 204 y queda guardado a nombre del usuario', async () => {
    const ruta_id = `e2e-${Date.now().toString(36)}`;
    const res = await api()
      .post('/api/uso/eventos')
      .set(...TEST_AUTH_HEADER)
      .send({ eventos: [{ evento: 'pantalla', modulo: 'fiado', ruta_id }], movil: true });
    expect(res.status).toBe(204);

    const rows = await testPrisma.uso_eventos.findMany({
      where: { ruta_id },
      include: { user: { select: { clerk_user_id: true } } },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.user.clerk_user_id).toBe(TEST_CLERK_USER_ID);
    expect(rows[0]?.movil).toBe(true);
    await testPrisma.uso_eventos.deleteMany({ where: { ruta_id } });
  });
});
