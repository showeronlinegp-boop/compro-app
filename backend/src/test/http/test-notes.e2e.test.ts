/**
 * test-notes.e2e.test.ts — HTTP de /api/test-notes (cambio test-notes).
 *
 * Dos apps:
 *   - "con flag": módulo mínimo (PrismaModule + AuthModule + TestNotesModule),
 *     equivalente a AppModule con TEST_NOTES_ENABLED=1.
 *   - "sin flag": AppModule real; en tests TEST_NOTES_ENABLED no está seteada,
 *     así que /api/test-notes no existe (A1 → 404).
 *
 * Dos usuarios de Clerk (A y B) según el token: las notas son COMPARTIDAS entre
 * cuentas (P1/A6), así que B ve y opera la nota de A y el autor sigue siendo A.
 * No hay describe en cross-user.isolation.test.ts a propósito.
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
import { AuthModule } from '../../common/auth/auth.module.js';
import { TEST_NOTES_ENABLED } from '../../config/env.js';
import { TestNotesModule } from '../../modules/test-notes/infrastructure/test-notes.module.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { TEST_CLERK_ISSUER } from '../helpers/auth-mock.js';
import { testPrisma } from '../helpers/test-client.js';

const USERS = {
  'token-a': { sub: 'clerk_test_notes_user_a', email: 'notas-a@test.example' },
  'token-b': { sub: 'clerk_test_notes_user_b', email: 'notas-b@test.example' },
} as const;
const AUTH_A: [string, string] = ['Authorization', 'Bearer token-a'];
const AUTH_B: [string, string] = ['Authorization', 'Bearer token-b'];

let app: INestApplication;
let appSinFlag: INestApplication;

async function borrarNotasDePrueba(): Promise<void> {
  await testPrisma.$executeRaw`
    DELETE FROM test_notes
    WHERE user_id IN (
      SELECT id FROM users WHERE clerk_user_id IN (${USERS['token-a'].sub}, ${USERS['token-b'].sub})
    )`;
}

beforeAll(async () => {
  vi.mocked(verifyToken).mockImplementation((async (token: string) => {
    const u = USERS[token as keyof typeof USERS];
    if (!u) throw new Error('invalid token');
    return { ...u, iss: TEST_CLERK_ISSUER, exp: Math.floor(Date.now() / 1000) + 3600 };
  }) as unknown as typeof verifyToken);

  const conFlag = await Test.createTestingModule({
    imports: [PrismaModule, AuthModule, TestNotesModule],
  }).compile();
  app = conFlag.createNestApplication<NestExpressApplication>();
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  const sinFlag = await Test.createTestingModule({ imports: [AppModule] }).compile();
  appSinFlag = sinFlag.createNestApplication<NestExpressApplication>();
  appSinFlag.useGlobalFilters(new AllExceptionsFilter());
  await appSinFlag.init();

  await borrarNotasDePrueba();
}, 30_000);

afterAll(async () => {
  await borrarNotasDePrueba();
  await app.close();
  await appSinFlag.close();
  await testPrisma.$disconnect();
});

const http = () => request(app.getHttpServer());

async function crearComoA(body: Record<string, unknown> = {}) {
  const res = await http()
    .post('/api/test-notes')
    .set(...AUTH_A)
    .send({ texto: 'Falla el total', ruta: '/cart', ...body });
  expect(res.status).toBe(201);
  return res.body as { id: number; autor: string; estado: string; user_id: number };
}

describe('A1 — gate por entorno', () => {
  it('en tests la flag está apagada', () => {
    expect(TEST_NOTES_ENABLED).toBe(false);
  });

  it('Flag ausente: AppModule sin la flag → GET /api/test-notes 404', async () => {
    const res = await request(appSinFlag.getHttpServer())
      .get('/api/test-notes')
      .set(...AUTH_A);
    expect(res.status).toBe(404);
  });

  it('Flag ausente: POST/PATCH/DELETE también 404', async () => {
    const srv = appSinFlag.getHttpServer();
    expect(
      (
        await request(srv)
          .post('/api/test-notes')
          .set(...AUTH_A)
          .send({})
      ).status,
    ).toBe(404);
    expect(
      (
        await request(srv)
          .patch('/api/test-notes/1')
          .set(...AUTH_A)
          .send({})
      ).status,
    ).toBe(404);
    expect(
      (
        await request(srv)
          .delete('/api/test-notes/1')
          .set(...AUTH_A)
      ).status,
    ).toBe(404);
  });

  it('Sin autenticación → 401', async () => {
    const res = await http().get('/api/test-notes');
    expect(res.status).toBe(401);
  });
});

describe('A2 — crear', () => {
  it('Alta completa → 201 con la nota completa', async () => {
    const res = await http()
      .post('/api/test-notes')
      .set(...AUTH_A)
      .send({
        texto: ' Falla ',
        ruta: '/cart',
        tipo: 'duda',
        modo: ['consultas', 'debatir', 'x', 'debatir'],
      });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      texto: 'Falla',
      tipo: 'duda',
      estado: 'abierta',
      modo: ['debatir', 'consultas'],
      autor: USERS['token-a'].email,
    });
    expect(res.body.id).toBeTypeOf('number');
    expect(res.body.created_at).toBeTypeOf('string');
  });

  it('Texto vacío → 400 con error', async () => {
    const res = await http()
      .post('/api/test-notes')
      .set(...AUTH_A)
      .send({ texto: '   ', ruta: '/' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('Contexto excedido → contexto null', async () => {
    const n = await crearComoA({ contexto: { errores: ['x'.repeat(50_001)] } });
    const lista = await http()
      .get('/api/test-notes')
      .set(...AUTH_A);
    const guardada = (lista.body as { id: number; contexto: unknown }[]).find((x) => x.id === n.id);
    expect(guardada?.contexto).toBeNull();
  });
});

describe('A3 — listar', () => {
  it('Orden: la abierta vieja antes que la corregida reciente', async () => {
    const vieja = await crearComoA({ texto: 'abierta vieja' });
    const reciente = await crearComoA({ texto: 'corregida reciente' });
    await http()
      .patch(`/api/test-notes/${reciente.id}`)
      .set(...AUTH_A)
      .send({ estado: 'corregida' })
      .expect(200);

    const res = await http()
      .get('/api/test-notes')
      .set(...AUTH_A);
    expect(res.status).toBe(200);
    const ids = (res.body as { id: number }[]).map((n) => n.id);
    expect(ids.indexOf(vieja.id)).toBeLessThan(ids.indexOf(reciente.id));
  });

  it('filtra por ruta e ignora un estado inválido', async () => {
    const ruta = `/e2e-${Date.now()}`;
    const n = await crearComoA({ ruta });
    const res = await http()
      .get('/api/test-notes')
      .query({ ruta, estado: 'rara' })
      .set(...AUTH_A);
    expect(res.status).toBe(200);
    expect((res.body as { id: number }[]).map((x) => x.id)).toEqual([n.id]);
  });
});

describe('A4 — actualizar', () => {
  it('Cerrar y reabrir: resuelta_at con fecha y después null', async () => {
    const n = await crearComoA();
    await http()
      .patch(`/api/test-notes/${n.id}`)
      .set(...AUTH_A)
      .send({ estado: 'para_revisar' });

    const cerrada = await http()
      .patch(`/api/test-notes/${n.id}`)
      .set(...AUTH_A)
      .send({ estado: 'corregida' });
    expect(cerrada.status).toBe(200);
    expect(cerrada.body.resuelta_at).toBeTypeOf('string');

    const reabierta = await http()
      .patch(`/api/test-notes/${n.id}`)
      .set(...AUTH_A)
      .send({ estado: 'abierta' });
    expect(reabierta.status).toBe(200);
    expect(reabierta.body.resuelta_at).toBeNull();
  });

  it('estado inválido, texto vacío o cuerpo vacío → 400', async () => {
    const n = await crearComoA();
    for (const body of [{ estado: 'rara' }, { texto: '  ' }, {}]) {
      const res = await http()
        .patch(`/api/test-notes/${n.id}`)
        .set(...AUTH_A)
        .send(body);
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    }
  });

  it('id no numérico → 400; inexistente → 404', async () => {
    const malo = await http()
      .patch('/api/test-notes/abc')
      .set(...AUTH_A)
      .send({ estado: 'abierta' });
    expect(malo.status).toBe(400);
    const inexistente = await http()
      .patch('/api/test-notes/999999999')
      .set(...AUTH_A)
      .send({ estado: 'abierta' });
    expect(inexistente.status).toBe(404);
  });
});

describe('A5 — borrar', () => {
  it('Borrado: devuelve { id } y un GET posterior no la incluye', async () => {
    const n = await crearComoA();
    const res = await http()
      .delete(`/api/test-notes/${n.id}`)
      .set(...AUTH_A);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: n.id });

    const lista = await http()
      .get('/api/test-notes')
      .set(...AUTH_A);
    expect((lista.body as { id: number }[]).some((x) => x.id === n.id)).toBe(false);
  });

  it('id no numérico → 400; inexistente → 404', async () => {
    expect(
      (
        await http()
          .delete('/api/test-notes/1.5')
          .set(...AUTH_A)
      ).status,
    ).toBe(400);
    expect(
      (
        await http()
          .delete('/api/test-notes/999999999')
          .set(...AUTH_A)
      ).status,
    ).toBe(404);
  });
});

describe('A6 — notas compartidas entre cuentas', () => {
  it('Otra cuenta ve la nota: B lista la nota de A con autor = email de A', async () => {
    const deA = await crearComoA({ texto: 'nota de A' });
    const res = await http()
      .get('/api/test-notes')
      .set(...AUTH_B);
    expect(res.status).toBe(200);
    const vista = (res.body as { id: number; autor: string }[]).find((x) => x.id === deA.id);
    expect(vista?.autor).toBe(USERS['token-a'].email);
  });

  it('Otra cuenta la opera: PATCH de B → 200, queda en_curso y el autor sigue siendo A', async () => {
    const deA = await crearComoA({ texto: 'nota de A para B' });
    const res = await http()
      .patch(`/api/test-notes/${deA.id}`)
      .set(...AUTH_B)
      .send({ estado: 'en_curso' });
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('en_curso');
    expect(res.body.autor).toBe(USERS['token-a'].email);
    expect(res.body.user_id).toBe(deA.user_id);
  });

  it('B puede borrar la nota de A', async () => {
    const deA = await crearComoA();
    const res = await http()
      .delete(`/api/test-notes/${deA.id}`)
      .set(...AUTH_B);
    expect(res.status).toBe(200);
  });
});
