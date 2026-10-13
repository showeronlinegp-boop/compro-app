/**
 * fiado.e2e.test.ts — HTTP del módulo Fiado contra el AppModule completo.
 *
 * Todas las rutas requieren sesión. El flujo crea datos reales del usuario de
 * e2e en compro_test; cada test usa nombres únicos para no depender del orden.
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
import { TEST_AUTH_HEADER, setupClerkMock } from '../helpers/auth-mock.js';

let app: INestApplication;
const api = () => request(app.getHttpServer());
const unico = (s: string) => `${s} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

beforeAll(async () => {
  setupClerkMock(vi.mocked(verifyToken));
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
}, 30_000);

afterAll(async () => {
  await app.close();
});

async function crearCliente(nombre = unico('Cliente')) {
  const res = await api()
    .post('/api/fiado/clientes')
    .set(...TEST_AUTH_HEADER)
    .send({ nombre, telefono: '11 1234-5678', limite: 1000 });
  expect(res.status).toBe(201);
  return res.body as { id: number; nombre: string };
}

describe('auth', () => {
  it('sin token → 401', async () => {
    const res = await api().get('/api/fiado/resumen');
    expect(res.status).toBe(401);
  });
});

describe('flujo fiado → pago → deshacer', () => {
  it('anota, registra pago, corrige y la ficha muestra todo el historial', async () => {
    const cliente = await crearCliente();

    const fiado = await api()
      .post('/api/fiado/movimientos')
      .set(...TEST_AUTH_HEADER)
      .send({ cliente_id: cliente.id, tipo: 'fiado', monto: 4200, nota: 'yerba' });
    expect(fiado.status).toBe(201);
    expect(fiado.body.cliente).toMatchObject({
      saldo: 4200,
      excede_limite: true,
      whatsapp: '5491112345678',
    });

    const pago = await api()
      .post('/api/fiado/movimientos')
      .set(...TEST_AUTH_HEADER)
      .send({ cliente_id: cliente.id, tipo: 'pago', monto: 1200 });
    expect(pago.body.cliente.saldo).toBe(3000);

    const corr = await api()
      .post(`/api/fiado/movimientos/${pago.body.movimiento.id}/correccion`)
      .set(...TEST_AUTH_HEADER);
    expect(corr.status).toBe(201);
    expect(corr.body.movimiento).toMatchObject({ tipo: 'correccion', monto: 1200 });
    expect(corr.body.cliente.saldo).toBe(4200);

    const otra = await api()
      .post(`/api/fiado/movimientos/${pago.body.movimiento.id}/correccion`)
      .set(...TEST_AUTH_HEADER);
    expect(otra.status).toBe(409);

    const ficha = await api()
      .get(`/api/fiado/clientes/${cliente.id}`)
      .set(...TEST_AUTH_HEADER);
    expect(ficha.status).toBe(200);
    expect(ficha.body.historial.map((m: { tipo: string }) => m.tipo)).toEqual([
      'correccion',
      'pago',
      'fiado',
    ]);
  });

  it('el resumen y la lista incluyen al cliente', async () => {
    const cliente = await crearCliente(unico('Zulma'));
    await api()
      .post('/api/fiado/movimientos')
      .set(...TEST_AUTH_HEADER)
      .send({ cliente_id: cliente.id, tipo: 'fiado', monto: 500 });

    const lista = await api()
      .get('/api/fiado/clientes')
      .query({ q: 'zulma', orden: 'az' })
      .set(...TEST_AUTH_HEADER);
    expect(lista.status).toBe(200);
    expect(lista.body.some((c: { id: number }) => c.id === cliente.id)).toBe(true);

    const resumen = await api()
      .get('/api/fiado/resumen')
      .set(...TEST_AUTH_HEADER);
    expect(resumen.status).toBe(200);
    expect(resumen.body.total).toBeGreaterThanOrEqual(500);
  });
});

describe('validación y rutas', () => {
  it('400 con monto inválido, tipo inválido o nombre vacío', async () => {
    const cliente = await crearCliente();
    const mal = (body: object) =>
      api()
        .post('/api/fiado/movimientos')
        .set(...TEST_AUTH_HEADER)
        .send(body);
    expect((await mal({ cliente_id: cliente.id, tipo: 'fiado', monto: 0 })).status).toBe(400);
    expect((await mal({ cliente_id: cliente.id, tipo: 'correccion', monto: 10 })).status).toBe(400);
    const sinNombre = await api()
      .post('/api/fiado/clientes')
      .set(...TEST_AUTH_HEADER)
      .send({ nombre: '  ' });
    expect(sinNombre.status).toBe(400);
    expect(sinNombre.body.error).toContain('nombre');
  });

  it('404 para cliente inexistente y orden inválido → 400', async () => {
    expect(
      (
        await api()
          .get('/api/fiado/clientes/999999999')
          .set(...TEST_AUTH_HEADER)
      ).status,
    ).toBe(404);
    expect(
      (
        await api()
          .get('/api/fiado/clientes?orden=x')
          .set(...TEST_AUTH_HEADER)
      ).status,
    ).toBe(400);
  });

  it('no existen rutas para editar ni borrar movimientos', async () => {
    const cliente = await crearCliente();
    const m = await api()
      .post('/api/fiado/movimientos')
      .set(...TEST_AUTH_HEADER)
      .send({ cliente_id: cliente.id, tipo: 'fiado', monto: 100 });
    const id = m.body.movimiento.id;
    for (const method of ['put', 'patch', 'delete'] as const) {
      const res = await api()
        [method](`/api/fiado/movimientos/${id}`)
        .set(...TEST_AUTH_HEADER);
      expect(res.status).toBe(404);
    }
  });

  it('ajustes: GET con defaults y PUT parcial', async () => {
    const get = await api()
      .get('/api/fiado/ajustes')
      .set(...TEST_AUTH_HEADER);
    expect(get.status).toBe(200);
    expect(get.body.plantilla_recordatorio).toContain('Hecho con Neggo');

    const put = await api()
      .put('/api/fiado/ajustes')
      .set(...TEST_AUTH_HEADER)
      .send({ dias_deuda_vieja: 45 });
    expect(put.status).toBe(200);
    expect(put.body.dias_deuda_vieja).toBe(45);

    const mal = await api()
      .put('/api/fiado/ajustes')
      .set(...TEST_AUTH_HEADER)
      .send({ dias_deuda_vieja: 0 });
    expect(mal.status).toBe(400);
  });
});
