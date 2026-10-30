/**
 * fiado-recargos.repo.test.ts — Recargos por atraso contra Postgres + Prisma.
 * Cada test corre en withRollback (no deja datos). Las fechas son relativas a
 * hoy (hora argentina), porque el repo calcula los atrasos con la fecha real.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testPrisma } from '../../../test/helpers/test-client.js';
import { withRollback } from '../../../test/helpers/with-rollback.js';
import { FiadoError, fechaAR, sumarDias } from '../domain/fiado.js';
import { makeFiadoRepo } from './fiado.repo.js';

type Tx = Parameters<Parameters<typeof testPrisma.$transaction>[0]>[0];

const hoy = fechaAR(new Date());
const haceDias = (n: number) => sumarDias(hoy, -n);
const fecha = (ymd: string) => new Date(`${ymd}T15:00:00Z`);
const mes5 = { esquema: 'mes', tipo: 'pct', valor: 5, tolerancia: 7 };

async function preparar(tx: Tx) {
  const u = await tx.users.create({
    data: { clerk_user_id: `test_recargo_${Date.now()}_${Math.random()}` },
  });
  const repo = makeFiadoRepo(tx, u.id);
  await repo.putAjustes({ comercio: 'Almacén Don Pepe' });
  const cliente = await tx.fiado_clientes.create({
    data: { user_id: u.id, nombre: 'Marta Giménez' },
  });
  /** Un fiado anotado hace `anotado` días que venció hace `vencio` días. */
  const fiado = (monto: number, vencio: number, anotado = vencio + 30) =>
    tx.fiado_movimientos.create({
      data: {
        user_id: u.id,
        cliente_id: cliente.id,
        tipo: 'fiado',
        monto,
        vence: new Date(`${haceDias(vencio)}T00:00:00Z`),
        created_at: fecha(haceDias(anotado)),
      },
    });
  return { u, repo, cliente, fiado };
}

/** Activa 5 % por mes y le avisa al cliente, para arrancar con sugerencias. */
async function activarYAvisar(repo: ReturnType<typeof makeFiadoRepo>, clienteId: number) {
  await repo.putAjustes({ recargo: mes5 });
  await repo.registrarAvisoRecargo(clienteId, 'informado');
}

const conflicto = (msg: RegExp) =>
  expect.objectContaining({ status: 409, message: expect.stringMatching(msg) });

beforeAll(async () => {
  await testPrisma.$queryRaw`SELECT 1`;
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe('apagado (como hasta ahora)', () => {
  it('la ficha no trae recargo y el cliente no queda pendiente de nada', async () => {
    await withRollback(async (tx) => {
      const { repo, cliente, fiado } = await preparar(tx);
      await fiado(28_000, 40);
      const f = await repo.ficha(cliente.id);
      expect(f.recargo).toBeNull();
      expect(f.cliente).toMatchObject({
        saldo: 28_000,
        vencido: 28_000,
        sin_recargo: false,
        recargos_pendientes: 0,
        recargo_para_sumar: 0,
        aviso_recargo_pendiente: false,
      });
      expect((await repo.getAjustes()).recargo).toBeNull();
    });
  });
});

describe('aviso obligatorio', () => {
  it('al activar, el cliente queda pendiente: no se le anotan fiados ni recargos, sí pagos', async () => {
    await withRollback(async (tx) => {
      const { repo, cliente, fiado } = await preparar(tx);
      await fiado(28_000, 14);
      const ajustes = await repo.putAjustes({ recargo: mes5 });
      expect(ajustes).toMatchObject({
        recargo_version: 1,
        recargo_condiciones:
          'un recargo del 5 % por cada mes de atraso, después de 7 días de gracia',
      });
      expect(ajustes.recargo).toMatchObject({ esquema: 'mes', valor: 5, activado_el: hoy });

      const f = await repo.ficha(cliente.id);
      expect(f.recargo?.aviso?.texto).toBe(
        'Hola Marta, te aviso que en Almacén Don Pepe los fiados que se atrasen tienen un recargo del 5 % por cada mes de atraso, después de 7 días de gracia.\n\nHecho con Neggo',
      );
      expect(f.recargo?.sugeridos).toEqual([]);
      expect(f.cliente.aviso_recargo_pendiente).toBe(true);

      const fiadoNuevo = {
        cliente_id: cliente.id,
        tipo: 'fiado' as const,
        monto: 100,
        nota: null,
        vence: null,
        idempotency_key: null,
      };
      await expect(repo.crearMovimiento(fiadoNuevo)).rejects.toEqual(conflicto(/avisale/));
      await expect(repo.sumarRecargos(cliente.id, null, null)).rejects.toEqual(
        conflicto(/avisale/),
      );
      const pago = await repo.crearMovimiento({ ...fiadoNuevo, tipo: 'pago' });
      expect(pago.movimiento.tipo).toBe('pago');
    });
  });

  it('el aviso queda registrado con el texto exacto y destraba al cliente', async () => {
    await withRollback(async (tx) => {
      const { u, repo, cliente, fiado } = await preparar(tx);
      await fiado(28_000, 14);
      await repo.putAjustes({ recargo: mes5 });
      const aviso = await repo.registrarAvisoRecargo(cliente.id, 'whatsapp');
      expect(aviso).toMatchObject({ cliente_id: cliente.id, version: 1, via: 'whatsapp' });
      expect(aviso.condiciones).toContain('5 % por cada mes de atraso');

      const guardados = await tx.fiado_avisos_recargo.findMany({ where: { user_id: u.id } });
      expect(guardados).toHaveLength(1);
      const f = await repo.ficha(cliente.id);
      expect(f.recargo?.aviso).toBeNull();
      expect(f.cliente.aviso_recargo_pendiente).toBe(false);
    });
  });

  it('un aviso no se puede editar (append-only)', async () => {
    await withRollback(async (tx) => {
      const { repo, cliente } = await preparar(tx);
      await repo.putAjustes({ recargo: mes5 });
      await repo.registrarAvisoRecargo(cliente.id, 'informado');
      await expect(
        tx.$executeRaw`UPDATE fiado_avisos_recargo SET via = 'whatsapp' WHERE cliente_id = ${cliente.id}`,
      ).rejects.toThrow(/append-only/);
    });
  });

  it('bajar las condiciones no pide aviso; subirlas o cambiar de esquema, sí', async () => {
    await withRollback(async (tx) => {
      const { repo, cliente } = await preparar(tx);
      await activarYAvisar(repo, cliente.id);
      expect((await repo.putAjustes({ recargo: { ...mes5, valor: 3 } })).recargo_version).toBe(1);
      expect((await repo.ficha(cliente.id)).cliente.aviso_recargo_pendiente).toBe(false);
      expect((await repo.putAjustes({ recargo: { ...mes5, valor: 6 } })).recargo_version).toBe(2);
      expect((await repo.ficha(cliente.id)).cliente.aviso_recargo_pendiente).toBe(true);
      await repo.registrarAvisoRecargo(cliente.id, 'informado');
      expect(
        (
          await repo.putAjustes({
            recargo: { esquema: 'semana', tipo: 'pct', valor: 1, tolerancia: 7 },
          })
        ).recargo_version,
      ).toBe(3);
      // Apagar no pide aviso y deja todo como antes.
      const apagado = await repo.putAjustes({ recargo: null });
      expect(apagado).toMatchObject({
        recargo: null,
        recargo_condiciones: null,
        recargo_version: 3,
      });
      expect((await repo.ficha(cliente.id)).recargo).toBeNull();
    });
  });

  it('un cliente nuevo también necesita el aviso antes del primer fiado', async () => {
    await withRollback(async (tx) => {
      const { repo } = await preparar(tx);
      await repo.putAjustes({ recargo: mes5 });
      const nuevo = await repo.crearCliente({
        nombre: 'Juan',
        telefono: null,
        etiqueta: null,
        limite: null,
        proximo_cobro: null,
      });
      expect(nuevo.aviso_recargo_pendiente).toBe(true);
    });
  });
});

describe('sugerir y sumar', () => {
  it('sugiere el 5 % del fiado vencido y "Sumar recargos" lo anota pegado al fiado', async () => {
    await withRollback(async (tx) => {
      const { repo, cliente, fiado } = await preparar(tx);
      const f = await fiado(28_000, 14);
      await activarYAvisar(repo, cliente.id);

      const ficha = await repo.ficha(cliente.id);
      expect(ficha.recargo?.sugeridos).toEqual([
        expect.objectContaining({
          fiado_id: f.id,
          monto: 1400,
          base: 28_000,
          periodo_desde: 1,
          periodo_hasta: 1,
          dias_atraso: 14,
        }),
      ]);
      expect(ficha.recargo?.total).toBe(1400);
      expect(ficha.cliente.recargo_para_sumar).toBe(1400);

      const r = await repo.sumarRecargos(cliente.id, null, 'clave-1');
      expect(r.movimientos).toEqual([
        expect.objectContaining({
          tipo: 'recargo',
          monto: 1400,
          recargo_de: f.id,
          recargo_periodo: 1,
          nota: '5 % de $ 28.000 · mes 1',
          pendiente: 1400,
        }),
      ]);
      expect(r.cliente).toMatchObject({
        saldo: 29_400,
        recargos_pendientes: 1400,
        recargo_para_sumar: 0,
      });

      const despues = await repo.ficha(cliente.id);
      expect(despues.recargo?.sugeridos).toEqual([]);
      expect(despues.historial[0]).toMatchObject({ tipo: 'recargo', recargo_de: f.id });
    });
  });

  it('doble toque con la misma clave no duplica', async () => {
    await withRollback(async (tx) => {
      const { u, repo, cliente, fiado } = await preparar(tx);
      await fiado(28_000, 14);
      await activarYAvisar(repo, cliente.id);
      const a = await repo.sumarRecargos(cliente.id, null, 'misma');
      const b = await repo.sumarRecargos(cliente.id, null, 'misma');
      expect(b.movimientos.map((m) => m.id)).toEqual(a.movimientos.map((m) => m.id));
      expect(await tx.fiado_movimientos.count({ where: { user_id: u.id, tipo: 'recargo' } })).toBe(
        1,
      );
    });
  });

  it('cada fiado por separado: se pueden sumar sólo algunos', async () => {
    await withRollback(async (tx) => {
      const { repo, cliente, fiado } = await preparar(tx);
      const a = await fiado(12_000, 14);
      const b = await fiado(16_000, 10);
      await activarYAvisar(repo, cliente.id);
      expect(
        (await repo.ficha(cliente.id)).recargo?.sugeridos.map((s) => [s.fiado_id, s.monto]),
      ).toEqual([
        [a.id, 600],
        [b.id, 800],
      ]);
      const r = await repo.sumarRecargos(cliente.id, [b.id], null);
      expect(r.movimientos.map((m) => m.recargo_de)).toEqual([b.id]);
      expect((await repo.ficha(cliente.id)).recargo?.sugeridos.map((s) => s.fiado_id)).toEqual([
        a.id,
      ]);
      await expect(repo.sumarRecargos(cliente.id, [b.id], null)).rejects.toEqual(
        conflicto(/cambiaron/),
      );
    });
  });

  it('sin nada para sumar: 409', async () => {
    await withRollback(async (tx) => {
      const { repo, cliente, fiado } = await preparar(tx);
      await fiado(28_000, 3); // todavía en la gracia
      await activarYAvisar(repo, cliente.id);
      await expect(repo.sumarRecargos(cliente.id, null, null)).rejects.toEqual(
        conflicto(/No hay recargos/),
      );
    });
  });

  it('el pago cubre primero el fiado y después su recargo', async () => {
    await withRollback(async (tx) => {
      const { repo, cliente, fiado } = await preparar(tx);
      const f = await fiado(28_000, 14);
      await activarYAvisar(repo, cliente.id);
      await repo.sumarRecargos(cliente.id, null, null);
      await repo.crearMovimiento({
        cliente_id: cliente.id,
        tipo: 'pago',
        monto: 28_000,
        nota: null,
        vence: null,
        idempotency_key: null,
      });
      const ficha = await repo.ficha(cliente.id);
      const pendiente = (id: number) => ficha.historial.find((m) => m.id === id)?.pendiente;
      const recargo = ficha.historial.find((m) => m.tipo === 'recargo');
      expect(pendiente(f.id)).toBe(0);
      expect(recargo?.pendiente).toBe(1400);
      expect(ficha.cliente).toMatchObject({ saldo: 1400, recargos_pendientes: 1400 });
      // El fiado ya está pagado: no genera más recargos.
      expect(ficha.recargo?.sugeridos).toEqual([]);
    });
  });
});

describe('perdonar, deshacer y no cobrar', () => {
  it('perdonar un recargo (deshacer) no hace reaparecer la sugerencia del mismo mes', async () => {
    await withRollback(async (tx) => {
      const { repo, cliente, fiado } = await preparar(tx);
      await fiado(28_000, 14);
      await activarYAvisar(repo, cliente.id);
      const { movimientos } = await repo.sumarRecargos(cliente.id, null, null);
      await repo.corregirMovimiento((movimientos[0] as { id: number }).id);
      const ficha = await repo.ficha(cliente.id);
      expect(ficha.cliente.saldo).toBe(28_000);
      expect(ficha.recargo?.sugeridos).toEqual([]);
    });
  });

  it('deshacer un fiado deshace también sus recargos', async () => {
    await withRollback(async (tx) => {
      const { repo, cliente, fiado } = await preparar(tx);
      const f = await fiado(28_000, 14);
      await activarYAvisar(repo, cliente.id);
      const { movimientos } = await repo.sumarRecargos(cliente.id, null, null);
      const r = await repo.corregirMovimiento(f.id);
      expect(r.cliente.saldo).toBe(0);
      const ficha = await repo.ficha(cliente.id);
      expect(
        ficha.historial.find((m) => m.id === movimientos[0]?.id)?.corregido_por,
      ).not.toBeNull();
      expect(ficha.historial.find((m) => m.id === f.id)?.corregido_por).not.toBeNull();
    });
  });

  it('"No cobrar" saltea el período de ese fiado y queda registrado', async () => {
    await withRollback(async (tx) => {
      const { u, repo, cliente, fiado } = await preparar(tx);
      const a = await fiado(12_000, 14);
      const b = await fiado(16_000, 10);
      await activarYAvisar(repo, cliente.id);
      const ficha = await repo.omitirRecargo(cliente.id, a.id);
      expect(ficha.recargo?.sugeridos.map((s) => s.fiado_id)).toEqual([b.id]);
      expect(await tx.fiado_recargo_omisiones.findMany({ where: { user_id: u.id } })).toEqual([
        expect.objectContaining({ fiado_id: a.id, periodo: 1 }),
      ]);
      await expect(repo.omitirRecargo(cliente.id, a.id)).rejects.toEqual(conflicto(/ya no está/));
    });
  });
});

describe('cliente "sin recargo"', () => {
  it('no se le sugiere nada; al reactivarlo hay que avisarle de nuevo', async () => {
    await withRollback(async (tx) => {
      const { repo, cliente, fiado } = await preparar(tx);
      await fiado(28_000, 14);
      await activarYAvisar(repo, cliente.id);
      const sin = await repo.actualizarCliente(cliente.id, { sin_recargo: true });
      expect(sin).toMatchObject({
        sin_recargo: true,
        recargo_para_sumar: 0,
        aviso_recargo_pendiente: false,
      });
      expect((await repo.ficha(cliente.id)).recargo).toBeNull();
      await expect(repo.registrarAvisoRecargo(cliente.id, 'informado')).rejects.toBeInstanceOf(
        FiadoError,
      );

      const con = await repo.actualizarCliente(cliente.id, { sin_recargo: false });
      expect(con.aviso_recargo_pendiente).toBe(true);
    });
  });
});

describe('inicio', () => {
  it('los clientes con un recargo para sumar aparecen primero en "Para cobrar hoy"', async () => {
    await withRollback(async (tx) => {
      const { u, repo, cliente, fiado } = await preparar(tx);
      // Otro cliente con una deuda más vieja pero ya tratada no va primero.
      const otro = await tx.fiado_clientes.create({ data: { user_id: u.id, nombre: 'Ana' } });
      await tx.fiado_movimientos.create({
        data: {
          user_id: u.id,
          cliente_id: otro.id,
          tipo: 'fiado',
          monto: 5000,
          vence: new Date(`${haceDias(20)}T00:00:00Z`),
          created_at: fecha(haceDias(40)),
        },
      });
      await fiado(28_000, 10);
      await repo.putAjustes({ recargo: mes5 });
      await repo.registrarAvisoRecargo(cliente.id, 'informado');
      await repo.registrarAvisoRecargo(otro.id, 'informado');
      await repo.omitirRecargo(
        otro.id,
        (await repo.ficha(otro.id)).recargo?.sugeridos[0]?.fiado_id ?? 0,
      );

      const r = await repo.resumen();
      expect(r.para_cobrar.map((c) => c.nombre)).toEqual(['Marta Giménez', 'Ana']);
      // Al sumarlo, vuelve a su lugar (la deuda de Ana venció antes).
      await repo.sumarRecargos(cliente.id, null, null);
      expect((await repo.resumen()).para_cobrar.map((c) => c.nombre)).toEqual([
        'Ana',
        'Marta Giménez',
      ]);
    });
  });
});

describe('reglas de la base', () => {
  it('un recargo sin fiado o con monto negativo no entra', async () => {
    await withRollback(async (tx) => {
      const { u, cliente } = await preparar(tx);
      await expect(
        tx.fiado_movimientos.create({
          data: {
            user_id: u.id,
            cliente_id: cliente.id,
            tipo: 'recargo',
            monto: 100,
            recargo_periodo: 1,
          },
        }),
      ).rejects.toThrow();
    });
  });
});
