/**
 * tutoriales.e2e.test.ts — HTTP de /api/tutoriales y /api/admin/tutoriales
 * contra el AppModule completo. El admin es "token-admin" (ADMIN_IDS se reemplaza).
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
import { ADMIN_IDS } from '../../common/tokens.js';
import { TEST_CLERK_ISSUER } from '../helpers/auth-mock.js';
import { testPrisma } from '../helpers/test-client.js';

const USERS = {
  'token-admin': { sub: 'clerk_e2e_tut_admin', email: 'tutoriales-admin@test.example' },
  'token-comercio': { sub: 'clerk_e2e_tut_comercio', email: 'tutoriales-comercio@test.example' },
} as const;
const AUTH_ADMIN: [string, string] = ['Authorization', 'Bearer token-admin'];
const AUTH_COMERCIO: [string, string] = ['Authorization', 'Bearer token-comercio'];
const ID = 'dQw4w9WgXcQ';

let app: INestApplication;
const api = () => request(app.getHttpServer());

beforeAll(async () => {
  vi.mocked(verifyToken).mockImplementation((async (token: string) => {
    const u = USERS[token as keyof typeof USERS];
    if (!u) throw new Error('invalid token');
    return { ...u, iss: TEST_CLERK_ISSUER, exp: Math.floor(Date.now() / 1000) + 3600 };
  }) as unknown as typeof verifyToken);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ADMIN_IDS)
    .useValue([USERS['token-admin'].sub])
    .compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
}, 30_000);

afterAll(async () => {
  await testPrisma.tutoriales.deleteMany({ where: { titulo: { startsWith: 'e2e ' } } });
  await testPrisma.users.deleteMany({
    where: { clerk_user_id: { in: Object.values(USERS).map((u) => u.sub) } },
  });
  await app.close();
  await testPrisma.$disconnect();
});

describe('tutoriales', () => {
  it('sin sesión → 401; un comercio no puede cargar ni borrar (403)', async () => {
    expect((await api().get('/api/tutoriales')).status).toBe(401);
    const crear = await api()
      .post('/api/admin/tutoriales')
      .set(...AUTH_COMERCIO)
      .send({ titulo: 'e2e intruso', link: `https://youtu.be/${ID}` });
    expect(crear.status).toBe(403);
    expect((await api().delete('/api/admin/tutoriales/1').set(...AUTH_COMERCIO)).status).toBe(403);
  });

  it('el admin carga uno, todos lo ven, y el admin lo borra', async () => {
    const titulo = `e2e ${Date.now().toString(36)}`;
    const creado = await api()
      .post('/api/admin/tutoriales')
      .set(...AUTH_ADMIN)
      .send({ titulo, link: `https://www.youtube.com/watch?v=${ID}&t=5s` });
    expect(creado.status).toBe(201);
    expect(creado.body).toMatchObject({ titulo, video_id: ID });

    const lista = await api()
      .get('/api/tutoriales')
      .set(...AUTH_COMERCIO);
    expect(lista.status).toBe(200);
    expect(lista.body).toContainEqual({ id: creado.body.id, titulo, video_id: ID });

    const borrar = () => api().delete(`/api/admin/tutoriales/${creado.body.id}`).set(...AUTH_ADMIN);
    expect((await borrar()).status).toBe(204);
    expect((await borrar()).status).toBe(404);
  });

  it('link que no es de YouTube → 400 con el motivo', async () => {
    const res = await api()
      .post('/api/admin/tutoriales')
      .set(...AUTH_ADMIN)
      .send({ titulo: 'e2e malo', link: 'https://example.com/video' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('YouTube');
  });
});
