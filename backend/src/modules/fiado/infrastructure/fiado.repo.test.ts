/**
 * fiado.repo.test.ts — Integración de makeFiadoRepo con Postgres + Prisma.
 * Cada test corre en withRollback (no deja datos).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testPrisma } from '../../../test/helpers/test-client.js';
import { withRollback } from '../../../test/helpers/with-rollback.js';
import { FiadoError, PLANTILLAS_DEFAULT } from '../domain/fiado.js';
import { makeFiadoRepo } from './fiado.repo.js';

type Tx = Parameters<Parameters<typeof testPrisma.$transaction>[0]>[0];

async function seedUser(tx: Tx): Promise<number> {
  const u = await tx.users.create({
    data: { clerk_user_id: `test_fiado_${Date.now()}_${Math.random()}` },
  });
  return u.id;
}

const diasAtras = (n: number) => new Date(Date.now() - n * 86_400_000);

beforeAll(async () => {
  await testPrisma.$queryRaw`SELECT 1`;
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe('clientes', () => {
  it('crea, lista con saldo 0 y actualiza campos opcionales', async () => {
    await withRollback(async (tx) => {
      const repo = makeFiadoRepo(tx, await seedUser(tx));
      const c = await repo.crearCliente({
        nombre: 'Marta Giménez',
        telefono: '11 1234-5678',
        etiqueta: null,
        limite: 50_000,
        proximo_cobro: '2026-11-01',
      });
      expect(c).toMatchObject({
        nombre: 'Marta Giménez',
        whatsapp: '5491112345678',
        saldo: 0,
        dias_sin_pagar: null,
        proximo_cobro: '2026-11-01',
        excede_limite: false,
      });

      const upd = await repo.actualizarCliente(c.id, { limite: null, etiqueta: 'Vecina' });
      expect(upd.limite).toBeNull();
      expect(upd.etiqueta).toBe('Vecina');
      expect(upd.nombre).toBe('Marta Giménez');
    });
  });

  it('busca sin tildes y ordena por deuda', async () => {
    await withRollback(async (tx) => {
      const repo = makeFiadoRepo(tx, await seedUser(tx));
      const base = { telefono: null, etiqueta: null, limite: null, proximo_cobro: null };
      const ana = await repo.crearCliente({ ...base, nombre: 'Ana' });
      const jose = await repo.crearCliente({ ...base, nombre: 'José' });
      await repo.crearMovimiento({
        cliente_id: ana.id,
        tipo: 'fiado',
        monto: 100,
        nota: null,
        vence: null,
        idempotency_key: null,
      });
      await repo.crearMovimiento({
        cliente_id: jose.id,
        tipo: 'fiado',
        monto: 900,
        nota: null,
        vence: null,
        idempotency_key: null,
      });

      expect((await repo.listClientes('', 'deuda')).map((c) => c.nombre)).toEqual(['José', 'Ana']);
      expect((await repo.listClientes('jose', 'deuda')).map((c) => c.nombre)).toEqual(['José']);
    });
  });
});

describe('movimientos', () => {
  it('fiado suma, pago resta y avisa cuando pasa el límite', async () => {
    await withRollback(async (tx) => {
      const repo = makeFiadoRepo(tx, await seedUser(tx));
      const c = await repo.crearCliente({
        nombre: 'Beto',
        telefono: null,
        etiqueta: null,
        limite: 5000,
        proximo_cobro: null,
      });

      const r1 = await repo.crearMovimiento({
        cliente_id: c.id,
        tipo: 'fiado',
        monto: 4200,
        nota: 'yerba',
        vence: null,
        idempotency_key: null,
      });
      expect(r1.movimiento).toMatchObject({ tipo: 'fiado', monto: 4200, nota: 'yerba' });
      expect(r1.cliente).toMatchObject({ saldo: 4200, excede_limite: false, dias_sin_pagar: 0 });

      const r2 = await repo.crearMovimiento({
        cliente_id: c.id,
        tipo: 'fiado',
        monto: 1000,
        nota: null,
        vence: null,
        idempotency_key: null,
      });
      expect(r2.cliente).toMatchObject({ saldo: 5200, excede_limite: true });

      const r3 = await repo.crearMovimiento({
        cliente_id: c.id,
        tipo: 'pago',
        monto: 6000,
        nota: null,
        vence: null,
        idempotency_key: null,
      });
      expect(r3.movimiento.monto).toBe(-6000);
      expect(r3.cliente).toMatchObject({ saldo: -800, dias_sin_pagar: null });
    });
  });

  it('la misma idempotency_key no duplica el movimiento', async () => {
    await withRollback(async (tx) => {
      const repo = makeFiadoRepo(tx, await seedUser(tx));
      const c = await repo.crearCliente({
        nombre: 'Ceci',
        telefono: null,
        etiqueta: null,
        limite: null,
        proximo_cobro: null,
      });
      const input = {
        cliente_id: c.id,
        tipo: 'fiado' as const,
        monto: 300,
        nota: null,
        vence: null,
        idempotency_key: 'k-1',
      };
      const a = await repo.crearMovimiento(input);
      const b = await repo.crearMovimiento(input);
      expect(b.movimiento.id).toBe(a.movimiento.id);
      expect(b.cliente.saldo).toBe(300);
    });
  });

  it('cliente inexistente → 404', async () => {
    await withRollback(async (tx) => {
      const repo = makeFiadoRepo(tx, await seedUser(tx));
      await expect(
        repo.crearMovimiento({
          cliente_id: 999_999_999,
          tipo: 'fiado',
          monto: 1,
          nota: null,
          vence: null,
          idempotency_key: null,
        }),
      ).rejects.toMatchObject({ status: 404 });
    });
  });
});

describe('corrección (Deshacer)', () => {
  it('crea una corrección visible, deja el saldo como antes y conserva el original', async () => {
    await withRollback(async (tx) => {
      const repo = makeFiadoRepo(tx, await seedUser(tx));
      const c = await repo.crearCliente({
        nombre: 'Dani',
        telefono: null,
        etiqueta: null,
        limite: null,
        proximo_cobro: null,
      });
      await repo.crearMovimiento({
        cliente_id: c.id,
        tipo: 'fiado',
        monto: 1000,
        nota: null,
        vence: null,
        idempotency_key: null,
      });
      const malo = await repo.crearMovimiento({
        cliente_id: c.id,
        tipo: 'fiado',
        monto: 4200,
        nota: null,
        vence: null,
        idempotency_key: null,
      });

      const corr = await repo.corregirMovimiento(malo.movimiento.id);
      expect(corr.movimiento).toMatchObject({
        tipo: 'correccion',
        monto: -4200,
        corrige_id: malo.movimiento.id,
      });
      expect(corr.cliente.saldo).toBe(1000);

      const { historial } = await repo.ficha(c.id);
      expect(historial).toHaveLength(3);
      const original = historial.find((m) => m.id === malo.movimiento.id);
      expect(original).toMatchObject({ monto: 4200, corregido_por: corr.movimiento.id });
    });
  });

  it('no se corrige dos veces ni se corrige una corrección (409)', async () => {
    await withRollback(async (tx) => {
      const repo = makeFiadoRepo(tx, await seedUser(tx));
      const c = await repo.crearCliente({
        nombre: 'Eli',
        telefono: null,
        etiqueta: null,
        limite: null,
        proximo_cobro: null,
      });
      const m = await repo.crearMovimiento({
        cliente_id: c.id,
        tipo: 'pago',
        monto: 500,
        nota: null,
        vence: null,
        idempotency_key: null,
      });
      const corr = await repo.corregirMovimiento(m.movimiento.id);

      await expect(repo.corregirMovimiento(m.movimiento.id)).rejects.toMatchObject({ status: 409 });
      await expect(repo.corregirMovimiento(corr.movimiento.id)).rejects.toBeInstanceOf(FiadoError);
    });
  });
});

describe('resumen y avisos', () => {
  const hoyAR = () =>
    new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
  const enDias = (n: number) =>
    new Date(Date.parse(`${hoyAR()}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

  it('para cobrar hoy = algo vencido (con fecha o por deuda vieja), y recordado hoy', async () => {
    await withRollback(async (tx) => {
      const userId = await seedUser(tx);
      const repo = makeFiadoRepo(tx, userId);
      const base = { telefono: null, etiqueta: null, limite: null, proximo_cobro: null };
      const vieja = await repo.crearCliente({ ...base, nombre: 'Vieja' });
      const vence = await repo.crearCliente({ ...base, nombre: 'Vence' });
      const nueva = await repo.crearCliente({ ...base, nombre: 'Nueva' });
      const pago = await repo.crearCliente({ ...base, nombre: 'Pagó' });
      const sinFecha = { nota: null, idempotency_key: null } as const;

      // Sin fecha y anotado hace 40 días: vence a los 30 (deuda vieja).
      await tx.fiado_movimientos.create({
        data: {
          user_id: userId,
          cliente_id: vieja.id,
          tipo: 'fiado',
          monto: 3000,
          created_at: diasAtras(40),
        },
      });
      await repo.crearMovimiento({
        ...sinFecha,
        cliente_id: vence.id,
        tipo: 'fiado',
        monto: 2000,
        vence: enDias(0),
      });
      await repo.crearMovimiento({
        ...sinFecha,
        cliente_id: nueva.id,
        tipo: 'fiado',
        monto: 1000,
        vence: enDias(3),
      });
      // Vencido pero pagado: el pago lo tapa y no queda nada vencido.
      await repo.crearMovimiento({
        ...sinFecha,
        cliente_id: pago.id,
        tipo: 'fiado',
        monto: 500,
        vence: enDias(-2),
      });
      await repo.crearMovimiento({
        ...sinFecha,
        cliente_id: pago.id,
        tipo: 'fiado',
        monto: 700,
        vence: enDias(10),
      });
      await repo.crearMovimiento({
        ...sinFecha,
        cliente_id: pago.id,
        tipo: 'pago',
        monto: 500,
        vence: null,
      });
      await repo.registrarRecordatorio(vieja.id);

      const r = await repo.resumen();
      expect(r.total).toBe(6700);
      expect(r.clientes_con_deuda).toBe(4);
      expect(r.para_cobrar.map((c) => [c.nombre, c.vencido, c.recordado_hoy])).toEqual([
        ['Vieja', 3000, true],
        ['Vence', 2000, false],
      ]);
      expect(r.ultimos.length).toBeLessThanOrEqual(4);

      const f = await repo.ficha(pago.id);
      expect(f.cliente.proximo_vencimiento).toEqual({ fecha: enDias(10), monto: 700 });
      expect(f.historial.filter((m) => m.tipo === 'fiado').map((m) => m.pendiente)).toEqual([
        700, 0,
      ]);

      const a = await repo.avisos();
      expect(a.vencidos.map((x) => [x.cliente_nombre, x.monto])).toEqual([['Vieja', 3000]]);
      expect(a.hoy.map((x) => [x.cliente_nombre, x.monto])).toEqual([['Vence', 2000]]);
      expect(a.proximos.map((x) => [x.cliente_nombre, x.fecha])).toEqual([['Nueva', enDias(3)]]);
      expect(a.sin_recordar).toBe(1);
    });
  });

  it('un pago no puede llevar fecha de cobro (CHECK de la base)', async () => {
    await withRollback(async (tx) => {
      const userId = await seedUser(tx);
      const repo = makeFiadoRepo(tx, userId);
      const c = await repo.crearCliente({
        nombre: 'X',
        telefono: null,
        etiqueta: null,
        limite: null,
        proximo_cobro: null,
      });
      await expect(
        tx.$executeRaw`INSERT INTO fiado_movimientos (user_id, cliente_id, tipo, monto, vence)
          VALUES (${userId}, ${c.id}, 'pago', -100, CURRENT_DATE)`,
      ).rejects.toThrow();
    });
  });
});

describe('ajustes', () => {
  it('devuelve defaults, guarda parcial y una plantilla null vuelve al default', async () => {
    await withRollback(async (tx) => {
      const repo = makeFiadoRepo(tx, await seedUser(tx));
      expect(await repo.getAjustes()).toEqual({
        comercio: '',
        alias: null,
        dias_deuda_vieja: 30,
        plantilla_fiado: PLANTILLAS_DEFAULT.fiado,
        plantilla_pago: PLANTILLAS_DEFAULT.pago,
        plantilla_recordatorio: PLANTILLAS_DEFAULT.recordatorio,
        recargo: null,
        recargo_condiciones: null,
        recargo_version: 0,
      });
      const a = await repo.putAjustes({
        comercio: 'Kiosco Lu',
        plantilla_pago: 'Gracias {nombre}',
      });
      expect(a).toMatchObject({ comercio: 'Kiosco Lu', plantilla_pago: 'Gracias {nombre}' });
      const b = await repo.putAjustes({ plantilla_pago: null, alias: 'kiosco.lu' });
      expect(b).toMatchObject({
        comercio: 'Kiosco Lu',
        alias: 'kiosco.lu',
        plantilla_pago: PLANTILLAS_DEFAULT.pago,
      });
    });
  });
});

describe('libro append-only en la base', () => {
  it('rechaza un UPDATE directo de un movimiento', async () => {
    await withRollback(async (tx) => {
      const repo = makeFiadoRepo(tx, await seedUser(tx));
      const c = await repo.crearCliente({
        nombre: 'F',
        telefono: null,
        etiqueta: null,
        limite: null,
        proximo_cobro: null,
      });
      const m = await repo.crearMovimiento({
        cliente_id: c.id,
        tipo: 'fiado',
        monto: 100,
        nota: null,
        vence: null,
        idempotency_key: null,
      });
      await expect(
        tx.$executeRaw`UPDATE fiado_movimientos SET monto = 1 WHERE id = ${m.movimiento.id}`,
      ).rejects.toThrow(/append-only/);
    });
  });

  it('rechaza un DELETE directo de un movimiento', async () => {
    await withRollback(async (tx) => {
      const repo = makeFiadoRepo(tx, await seedUser(tx));
      const c = await repo.crearCliente({
        nombre: 'G',
        telefono: null,
        etiqueta: null,
        limite: null,
        proximo_cobro: null,
      });
      const m = await repo.crearMovimiento({
        cliente_id: c.id,
        tipo: 'fiado',
        monto: 100,
        nota: null,
        vence: null,
        idempotency_key: null,
      });
      await expect(
        tx.$executeRaw`DELETE FROM fiado_movimientos WHERE id = ${m.movimiento.id}`,
      ).rejects.toThrow(/append-only/);
    });
  });

  it('rechaza un pago con signo positivo (CHECK)', async () => {
    await withRollback(async (tx) => {
      const userId = await seedUser(tx);
      const repo = makeFiadoRepo(tx, userId);
      const c = await repo.crearCliente({
        nombre: 'H',
        telefono: null,
        etiqueta: null,
        limite: null,
        proximo_cobro: null,
      });
      await expect(
        tx.fiado_movimientos.create({
          data: { user_id: userId, cliente_id: c.id, tipo: 'pago', monto: 100 },
        }),
      ).rejects.toThrow();
    });
  });

  it('borrar el usuario borra su libro en cascada', async () => {
    await withRollback(async (tx) => {
      const userId = await seedUser(tx);
      const repo = makeFiadoRepo(tx, userId);
      const c = await repo.crearCliente({
        nombre: 'I',
        telefono: null,
        etiqueta: null,
        limite: null,
        proximo_cobro: null,
      });
      const m = await repo.crearMovimiento({
        cliente_id: c.id,
        tipo: 'fiado',
        monto: 100,
        nota: null,
        vence: null,
        idempotency_key: null,
      });
      await repo.corregirMovimiento(m.movimiento.id);

      await tx.users.delete({ where: { id: userId } });
      expect(await tx.fiado_movimientos.count({ where: { user_id: userId } })).toBe(0);
    });
  });
});
