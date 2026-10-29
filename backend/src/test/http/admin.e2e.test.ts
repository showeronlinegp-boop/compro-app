/**
 * admin.e2e.test.ts — HTTP de /api/admin/uso contra el AppModule completo.
 *
 * ADMIN_IDS y Clerk se reemplazan: el admin es el usuario "token-admin" y el
 * último ingreso sale de un fake (el test no habla con Clerk).
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
import { ADMIN_IDS, CLERK_INGRESOS } from '../../common/tokens.js';
import type { ClerkIngresos } from '../../modules/admin/infrastructure/clerk-ingresos.js';
import { TEST_CLERK_ISSUER } from '../helpers/auth-mock.js';
import { testPrisma } from '../helpers/test-client.js';

const USERS = {
  'token-admin': { sub: 'clerk_e2e_admin', email: 'admin@test.example' },
  'token-comercio': { sub: 'clerk_e2e_admin_comercio', email: 'comercio@test.example' },
} as const;
const AUTH_ADMIN: [string, string] = ['Authorization', 'Bearer token-admin'];
const AUTH_COMERCIO: [string, string] = ['Authorization', 'Bearer token-comercio'];

let app: INestApplication;
let clerkFalla = false;
const api = () => request(app.getHttpServer());

const clerkFake: ClerkIngresos = async (ids) => {
  if (clerkFalla) throw new Error('Clerk caído');
  return new Map(
    ids.map((id) => [id, { last_active_at: new Date(), last_sign_in_at: new Date() }]),
  );
};

beforeAll(async () => {
  vi.mocked(verifyToken).mockImplementation((async (token: string) => {
    const u = USERS[token as keyof typeof USERS];
    if (!u) throw new Error('invalid token');
    return { ...u, iss: TEST_CLERK_ISSUER, exp: Math.floor(Date.now() / 1000) + 3600 };
  }) as unknown as typeof verifyToken);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ADMIN_IDS)
    .useValue([USERS['token-admin'].sub])
    .overrideProvider(CLERK_INGRESOS)
    .useValue(clerkFake)
    .compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
}, 30_000);

afterAll(async () => {
  await app.close();
  await testPrisma.$disconnect();
});

describe('GET /api/admin/uso', () => {
  it('sin sesión → 401', async () => {
    expect((await api().get('/api/admin/uso')).status).toBe(401);
  });

  it('con sesión de un comercio que no es admin → 403', async () => {
    const res = await api()
      .get('/api/admin/uso')
      .set(...AUTH_COMERCIO);
    expect(res.status).toBe(403);
  });

  it('semanas inválido → 400', async () => {
    const res = await api()
      .get('/api/admin/uso?semanas=99')
      .set(...AUTH_ADMIN);
    expect(res.status).toBe(400);
  });

  it('admin → reporte; el admin no cuenta y no salen datos de los clientes', async () => {
    const nombreCliente = `Cliente secreto ${Date.now()}`;
    const alta = await api()
      .post('/api/fiado/clientes')
      .set(...AUTH_COMERCIO)
      .send({ nombre: nombreCliente });
    expect(alta.status).toBe(201);

    const res = await api()
      .get('/api/admin/uso?semanas=4')
      .set(...AUTH_ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.ingresos).toBe('clerk');
    expect(res.body.semanal).toHaveLength(4);
    expect(res.body.embudo[0]).toMatchObject({ paso: 'Se registró' });

    const emails = res.body.comercios.map((c: { email: string | null }) => c.email);
    expect(emails).toContain('comercio@test.example');
    expect(emails).not.toContain('admin@test.example');
    const comercio = res.body.comercios.find(
      (c: { email: string | null }) => c.email === 'comercio@test.example',
    );
    expect(comercio.clientes).toBeGreaterThanOrEqual(1);
    expect(comercio.ultimo_ingreso).not.toBeNull();

    expect(JSON.stringify(res.body)).not.toContain(nombreCliente);
  });

  it('si Clerk falla el reporte sale igual, sin último ingreso', async () => {
    clerkFalla = true;
    try {
      const res = await api()
        .get('/api/admin/uso')
        .set(...AUTH_ADMIN);
      expect(res.status).toBe(200);
      expect(res.body.ingresos).toBe('no_disponible');
      expect(res.body.totales.ingresaron_7d).toBeNull();
    } finally {
      clerkFalla = false;
    }
  });
});
