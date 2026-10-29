/**
 * uso-eventos.repo.test.ts — Integración del registro y la limpieza de eventos.
 * Cada test corre en withRollback (no deja datos).
 */

import { afterAll, describe, expect, it } from 'vitest';
import { testPrisma } from '../../../test/helpers/test-client.js';
import { withRollback } from '../../../test/helpers/with-rollback.js';
import { makeUsoEventosRepo, purgarEventosViejos } from './uso-eventos.repo.js';

type Tx = Parameters<Parameters<typeof testPrisma.$transaction>[0]>[0];

const nuevoUsuario = (tx: Tx) =>
  tx.users.create({ data: { clerk_user_id: `test_uso_ev_${Date.now()}_${Math.random()}` } });

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe('registrar', () => {
  it('guarda cada evento con el dueño y el contexto del lote', async () => {
    await withRollback(async (tx) => {
      const u = await nuevoUsuario(tx);
      await makeUsoEventosRepo(tx, u.id).registrar({
        eventos: [
          { evento: 'pantalla', modulo: 'fiado', ruta_id: 'inicio' },
          { evento: 'comprobante', modulo: 'fiado', ruta_id: null },
        ],
        standalone: true,
        movil: false,
      });
      const rows = await tx.uso_eventos.findMany({
        where: { user_id: u.id },
        orderBy: { id: 'asc' },
      });
      expect(rows.map((r) => [r.evento, r.ruta_id, r.standalone, r.movil])).toEqual([
        ['pantalla', 'inicio', true, false],
        ['comprobante', null, true, false],
      ]);
    });
  });
});

describe('purgarEventosViejos', () => {
  it('borra sólo los de más de 400 días', async () => {
    await withRollback(async (tx) => {
      const u = await nuevoUsuario(tx);
      const ahora = new Date('2026-10-29T12:00:00Z');
      const haceDias = (n: number) => new Date(ahora.getTime() - n * 86_400_000);
      await tx.uso_eventos.createMany({
        data: [401, 399].map((n) => ({
          user_id: u.id,
          evento: 'pantalla',
          modulo: 'fiado',
          ruta_id: `hace-${n}`,
          created_at: haceDias(n),
        })),
      });
      expect(await purgarEventosViejos(tx, ahora)).toBeGreaterThanOrEqual(1);
      const quedan = await tx.uso_eventos.findMany({ where: { user_id: u.id } });
      expect(quedan.map((r) => r.ruta_id)).toEqual(['hace-399']);
    });
  });
});
