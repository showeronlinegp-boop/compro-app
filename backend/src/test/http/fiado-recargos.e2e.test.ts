/**
 * fiado-recargos.e2e.test.ts — HTTP de los recargos por atraso.
 *
 * Usa dos usuarios propios (no el de e2e compartido) para no dejar los
 * recargos prendidos en otros tests: A configura y opera; B intenta tocar los
 * clientes de A y recibe 404.
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
import { fechaAR, sumarDias } from '../../modules/fiado/domain/fiado.js';
import { TEST_CLERK_ISSUER } from '../helpers/auth-mock.js';
import { testPrisma } from '../helpers/test-client.js';

const USERS = {
  'token-a': { sub: 'clerk_e2e_recargos_a', email: 'recargos-a@test.example' },
  'token-b': { sub: 'clerk_e2e_recargos_b', email: 'recargos-b@test.example' },
} as const;
const A: [string, string] = ['Authorization', 'Bearer token-a'];
const B: [string, string] = ['Authorization', 'Bearer token-b'];

let app: INestApplication;
const api = () => request(app.getHttpServer());

async function borrarDatos() {
  await testPrisma.$executeRaw`
    DELETE FROM users WHERE clerk_user_id IN (${USERS['token-a'].sub}, ${USERS['token-b'].sub})`;
}

beforeAll(async () => {
  vi.mocked(verifyToken).mockImplementation((async (token: string) => {
    const u = USERS[token as keyof typeof USERS];
    if (!u) throw new Error('invalid token');
    return { ...u, iss: TEST_CLERK_ISSUER, exp: Math.floor(Date.now() / 1000) + 3600 };
  }) as unknown as typeof verifyToken);
  await borrarDatos();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
}, 30_000);

afterAll(async () => {
  await app.close();
  await borrarDatos();
  await testPrisma.$disconnect();
});

describe('recargos por HTTP', () => {
  it('configuración inválida → 400', async () => {
    const res = await api()
      .put('/api/fiado/ajustes')
      .set(...A)
      .send({ recargo: { esquema: 'dia', tipo: 'pct', valor: 5 } });
    expect(res.status).toBe(400);
  });

  it('circuito completo: activar, avisar, sumar, no cobrar y apagar', async () => {
    // Un cliente con un fiado vencido hace 14 días (se carga directo para fijar la fecha).
    const cliente = await api()
      .post('/api/fiado/clientes')
      .set(...A)
      .send({ nombre: 'Marta' });
    expect(cliente.status).toBe(201);
    const user = await testPrisma.users.findUniqueOrThrow({
      where: { clerk_user_id: USERS['token-a'].sub },
    });
    const hoy = fechaAR(new Date());
    const fiado = await testPrisma.fiado_movimientos.create({
      data: {
        user_id: user.id,
        cliente_id: cliente.body.id,
        tipo: 'fiado',
        monto: 28_000,
        vence: new Date(`${sumarDias(hoy, -14)}T00:00:00Z`),
        created_at: new Date(`${sumarDias(hoy, -40)}T15:00:00Z`),
      },
    });

    const ajustes = await api()
      .put('/api/fiado/ajustes')
      .set(...A)
      .send({ recargo: { esquema: 'mes', tipo: 'pct', valor: 5, tolerancia: 7 } });
    expect(ajustes.status).toBe(200);
    expect(ajustes.body).toMatchObject({ recargo_version: 1 });

    // Sin aviso: la ficha trae el texto y no se le pueden anotar fiados.
    const ficha = await api()
      .get(`/api/fiado/clientes/${cliente.body.id}`)
      .set(...A);
    expect(ficha.body.recargo.aviso.texto).toContain('5 % por cada mes de atraso');
    const bloqueado = await api()
      .post('/api/fiado/movimientos')
      .set(...A)
      .send({ cliente_id: cliente.body.id, tipo: 'fiado', monto: 100 });
    expect(bloqueado.status).toBe(409);

    const viaMala = await api()
      .post(`/api/fiado/clientes/${cliente.body.id}/aviso-recargo`)
      .set(...A)
      .send({ via: 'mail' });
    expect(viaMala.status).toBe(400);
    const aviso = await api()
      .post(`/api/fiado/clientes/${cliente.body.id}/aviso-recargo`)
      .set(...A)
      .send({ via: 'whatsapp' });
    expect(aviso.status).toBe(201);

    const conSugerencia = await api()
      .get(`/api/fiado/clientes/${cliente.body.id}`)
      .set(...A);
    expect(conSugerencia.body.recargo.sugeridos).toEqual([
      expect.objectContaining({ fiado_id: fiado.id, monto: 1400 }),
    ]);

    // B no puede tocar los clientes de A.
    const ajeno = await api()
      .post(`/api/fiado/clientes/${cliente.body.id}/recargos`)
      .set(...B)
      .send({});
    expect(ajeno.status).toBe(404);

    const malBody = await api()
      .post(`/api/fiado/clientes/${cliente.body.id}/recargos`)
      .set(...A)
      .send({ fiado_ids: ['x'] });
    expect(malBody.status).toBe(400);

    const sumados = await api()
      .post(`/api/fiado/clientes/${cliente.body.id}/recargos`)
      .set(...A)
      .send({ idempotency_key: 'e2e-recargo' });
    expect(sumados.status).toBe(201);
    expect(sumados.body.movimientos).toEqual([
      expect.objectContaining({ tipo: 'recargo', monto: 1400, recargo_de: fiado.id }),
    ]);
    expect(sumados.body.cliente.saldo).toBe(29_400);

    const nadaQueOmitir = await api()
      .post(`/api/fiado/clientes/${cliente.body.id}/recargos/omitir`)
      .set(...A)
      .send({ fiado_id: fiado.id });
    expect(nadaQueOmitir.status).toBe(409);

    // Apagar: la ficha vuelve a ser la de siempre y se pueden anotar fiados.
    const apagado = await api()
      .put('/api/fiado/ajustes')
      .set(...A)
      .send({ recargo: null });
    expect(apagado.body).toMatchObject({ recargo: null });
    const fiadoNuevo = await api()
      .post('/api/fiado/movimientos')
      .set(...A)
      .send({ cliente_id: cliente.body.id, tipo: 'fiado', monto: 100 });
    expect(fiadoNuevo.status).toBe(201);
  });

  it('editar cliente: sin_recargo debe ser booleano', async () => {
    const cliente = await api()
      .post('/api/fiado/clientes')
      .set(...A)
      .send({ nombre: 'Juan' });
    const res = await api()
      .patch(`/api/fiado/clientes/${cliente.body.id}`)
      .set(...A)
      .send({ sin_recargo: 'si' });
    expect(res.status).toBe(400);
    const ok = await api()
      .patch(`/api/fiado/clientes/${cliente.body.id}`)
      .set(...A)
      .send({ sin_recargo: true });
    expect(ok.body.sin_recargo).toBe(true);
  });
});
