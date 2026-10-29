/**
 * uso.repo.test.ts — Integración de makeUsoRepo con Postgres + Prisma.
 * Cada test corre en withRollback (no deja datos). La base de tests tiene
 * usuarios de otros tests: se mira sólo a los que siembra cada test.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testPrisma } from '../../../test/helpers/test-client.js';
import { withRollback } from '../../../test/helpers/with-rollback.js';
import { makeUsoRepo } from './uso.repo.js';

type Tx = Parameters<Parameters<typeof testPrisma.$transaction>[0]>[0];

const clerkId = () => `test_uso_${Date.now()}_${Math.random()}`;

async function seedUser(tx: Tx, clerk_user_id = clerkId()) {
  return tx.users.create({ data: { clerk_user_id, email: 'uso@test.example' } });
}

beforeAll(async () => {
  await testPrisma.$queryRaw`SELECT 1`;
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe('comercios', () => {
  it('cuenta clientes, movimientos, recordatorios y ajustes de cada comercio', async () => {
    await withRollback(async (tx) => {
      const u = await seedUser(tx);
      const otro = await seedUser(tx);
      const c1 = await tx.fiado_clientes.create({
        data: { user_id: u.id, nombre: 'Marta', telefono: '1112345678', limite: 5000 },
      });
      await tx.fiado_clientes.create({ data: { user_id: u.id, nombre: 'José', etiqueta: '' } });
      // Datos de otro comercio: no se mezclan.
      await tx.fiado_clientes.create({ data: { user_id: otro.id, nombre: 'Ana' } });

      const fiado = await tx.fiado_movimientos.create({
        data: {
          user_id: u.id,
          cliente_id: c1.id,
          tipo: 'fiado',
          monto: 1000,
          vence: new Date('2026-11-15'),
        },
      });
      await tx.fiado_movimientos.create({
        data: { user_id: u.id, cliente_id: c1.id, tipo: 'fiado', monto: 500 },
      });
      await tx.fiado_movimientos.create({
        data: { user_id: u.id, cliente_id: c1.id, tipo: 'pago', monto: -300 },
      });
      await tx.fiado_movimientos.create({
        data: {
          user_id: u.id,
          cliente_id: c1.id,
          tipo: 'correccion',
          monto: -1000,
          corrige_id: fiado.id,
        },
      });
      await tx.fiado_recordatorios.create({ data: { user_id: u.id, cliente_id: c1.id } });
      await tx.fiado_ajustes.create({
        data: { user_id: u.id, comercio: 'Almacén', alias: 'mi.alias', plantilla_pago: 'Hola' },
      });

      const rows = await makeUsoRepo(tx, []).comercios();
      const fila = rows.find((r) => r.user_id === u.id);
      expect(fila).toMatchObject({
        clerk_user_id: u.clerk_user_id,
        email: 'uso@test.example',
        comercio: 'Almacén',
        alias: true,
        plantillas_propias: 1,
        clientes: 2,
        clientes_con_telefono: 1,
        clientes_con_limite: 1,
        clientes_con_etiqueta: 0,
        clientes_con_proximo_cobro: 0,
        fiados: 2,
        fiados_con_vence: 1,
        pagos: 1,
        correcciones: 1,
        recordatorios: 1,
      });
      expect(fila?.alta).toBeInstanceOf(Date);
      expect(fila?.primer_fiado).toBeInstanceOf(Date);
      expect(fila?.primer_recordatorio).toBeInstanceOf(Date);
      expect(fila?.ultima_actividad).toBeInstanceOf(Date);

      expect(rows.find((r) => r.user_id === otro.id)).toMatchObject({ clientes: 1, fiados: 0 });
    });
  });

  it('un comercio recién registrado sale con todo en cero y sin actividad', async () => {
    await withRollback(async (tx) => {
      const u = await seedUser(tx);
      const fila = (await makeUsoRepo(tx, []).comercios()).find((r) => r.user_id === u.id);
      expect(fila).toMatchObject({
        comercio: null,
        alias: false,
        plantillas_propias: 0,
        clientes: 0,
        fiados: 0,
        recordatorios: 0,
        primer_cliente: null,
        ultima_actividad: null,
      });
    });
  });

  it('deja afuera las cuentas excluidas', async () => {
    await withRollback(async (tx) => {
      const prueba = await seedUser(tx);
      const real = await seedUser(tx);
      const ids = (await makeUsoRepo(tx, [prueba.clerk_user_id]).comercios()).map((r) => r.user_id);
      expect(ids).toContain(real.id);
      expect(ids).not.toContain(prueba.id);
    });
  });
});

describe('actividad', () => {
  it('una fila por (comercio, semana, acción), con la semana en hora argentina', async () => {
    await withRollback(async (tx) => {
      const u = await seedUser(tx);
      // Domingo 25/10 23:30 AR = lunes 26/10 02:30 UTC → semana del 19/10.
      const domingoNoche = new Date('2026-10-26T02:30:00Z');
      const c = await tx.fiado_clientes.create({
        data: { user_id: u.id, nombre: 'Marta', created_at: domingoNoche },
      });
      for (const created_at of [domingoNoche, new Date('2026-10-27T15:00:00Z')]) {
        await tx.fiado_movimientos.create({
          data: { user_id: u.id, cliente_id: c.id, tipo: 'fiado', monto: 100, created_at },
        });
      }
      await tx.fiado_movimientos.create({
        data: {
          user_id: u.id,
          cliente_id: c.id,
          tipo: 'fiado',
          monto: 100,
          created_at: new Date('2026-09-01T15:00:00Z'),
        },
      });
      await tx.fiado_recordatorios.create({
        data: { user_id: u.id, cliente_id: c.id, enviado_at: new Date('2026-10-28T15:00:00Z') },
      });

      const rows = (await makeUsoRepo(tx, []).actividad('2026-10-19'))
        .filter((r) => r.user_id === u.id)
        .sort((a, b) => `${a.semana}${a.accion}`.localeCompare(`${b.semana}${b.accion}`));
      expect(rows).toEqual([
        { user_id: u.id, semana: '2026-10-19', accion: 'cliente' },
        { user_id: u.id, semana: '2026-10-19', accion: 'fiado' },
        { user_id: u.id, semana: '2026-10-26', accion: 'fiado' },
        { user_id: u.id, semana: '2026-10-26', accion: 'recordatorio' },
      ]);
    });
  });

  it('deja afuera las cuentas excluidas', async () => {
    await withRollback(async (tx) => {
      const u = await seedUser(tx);
      await tx.fiado_clientes.create({ data: { user_id: u.id, nombre: 'Marta' } });
      const rows = await makeUsoRepo(tx, [u.clerk_user_id]).actividad('2000-01-03');
      expect(rows.some((r) => r.user_id === u.id)).toBe(false);
    });
  });
});
