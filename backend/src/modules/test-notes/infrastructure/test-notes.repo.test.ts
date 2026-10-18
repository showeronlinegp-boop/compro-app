/**
 * test-notes.repo.test.ts — integración de makeTestNotesRepo / makeTestNotesAdminRepo
 * (Postgres + Prisma) con withRollback por test.
 *
 * Notas COMPARTIDAS entre cuentas (P1): el repo de B ve y opera la nota de A,
 * y el autor (user_id) nunca cambia.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testPrisma } from '../../../test/helpers/test-client.js';
import { withRollback } from '../../../test/helpers/with-rollback.js';
import { type NewNote, parseCreate } from '../domain/test-note.js';
import { makeTestNotesAdminRepo, makeTestNotesRepo } from './test-notes.repo.js';

type Tx = Parameters<Parameters<typeof testPrisma.$transaction>[0]>[0];

async function seedUser(tx: Tx, email: string | null = null): Promise<number> {
  const u = await tx.users.create({
    data: { clerk_user_id: `test_notes_${Date.now()}_${Math.random()}`, email },
  });
  return u.id;
}

function nota(over: Record<string, unknown> = {}): NewNote {
  const r = parseCreate({ texto: 'Falla algo', ruta: '/cart', ...over });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

beforeAll(async () => {
  await testPrisma.$queryRaw`SELECT 1`;
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe('makeTestNotesRepo', () => {
  it('create guarda al usuario como autor y devuelve la nota completa', async () => {
    await withRollback(async (tx) => {
      const a = await seedUser(tx, 'a@test.example');
      const repo = makeTestNotesRepo(tx, () => a);
      const n = await repo.create(
        nota({
          tipo: 'duda',
          modo: ['consultas', 'debatir'],
          pos_x: 0.5,
          pos_y: 120,
          viewport_w: 390,
          contexto: { viewport: '390x844', errores: [] },
        }),
      );
      expect(n.id).toBeGreaterThan(0);
      expect(n.user_id).toBe(a);
      expect(n.autor).toBe('a@test.example');
      expect(n.tipo).toBe('duda');
      expect(n.estado).toBe('abierta');
      expect(n.modo).toEqual(['debatir', 'consultas']);
      expect(n.pos_x).toBe(0.5);
      expect(n.pos_y).toBe(120);
      expect(n.contexto).toEqual({ viewport: '390x844', errores: [] });
      expect(n.resuelta_at).toBeNull();
      expect(typeof n.created_at).toBe('string');
      expect(new Date(n.created_at).toISOString()).toBe(n.created_at);
    });
  });

  it('Autor sin email → autor = #<user_id>', async () => {
    await withRollback(async (tx) => {
      const a = await seedUser(tx, null);
      const n = await makeTestNotesRepo(tx, a).create(nota());
      expect(n.autor).toBe(`#${a}`);
      expect(n.contexto).toBeNull();
    });
  });

  it('Orden: vivas primero aunque la cerrada sea más reciente', async () => {
    await withRollback(async (tx) => {
      const a = await seedUser(tx);
      const repo = makeTestNotesRepo(tx, a);
      const vieja = await repo.create(nota({ texto: 'abierta vieja' }));
      const reciente = await repo.create(nota({ texto: 'corregida reciente' }));
      await repo.update(reciente.id, { estado: 'corregida', resuelta_at: new Date() });

      const ids = (await repo.list({})).map((n) => n.id);
      expect(ids.indexOf(vieja.id)).toBeLessThan(ids.indexOf(reciente.id));
    });
  });

  it('dentro de las vivas, la más nueva primero', async () => {
    await withRollback(async (tx) => {
      const a = await seedUser(tx);
      const repo = makeTestNotesRepo(tx, a);
      const n1 = await repo.create(nota());
      const n2 = await repo.create(nota());
      const ids = (await repo.list({})).map((n) => n.id);
      expect(ids.indexOf(n2.id)).toBeLessThan(ids.indexOf(n1.id));
    });
  });

  it('filtra por estado y por ruta', async () => {
    await withRollback(async (tx) => {
      const a = await seedUser(tx);
      const repo = makeTestNotesRepo(tx, a);
      const ruta = `/filtro-${Math.random()}`;
      const n1 = await repo.create(nota({ ruta }));
      const n2 = await repo.create(nota({ ruta }));
      const otra = await repo.create(nota({ ruta: `${ruta}-otra` }));
      await repo.update(n2.id, { estado: 'en_curso', resuelta_at: null });

      const porRuta = await repo.list({ ruta });
      expect(porRuta.map((n) => n.id).sort()).toEqual([n1.id, n2.id].sort());

      const enCurso = await repo.list({ ruta, estado: 'en_curso' });
      expect(enCurso.map((n) => n.id)).toEqual([n2.id]);
      expect(porRuta.some((n) => n.id === otra.id)).toBe(false);
    });
  });

  it('Cerrar y reabrir: resuelta_at con fecha y después null', async () => {
    await withRollback(async (tx) => {
      const a = await seedUser(tx);
      const repo = makeTestNotesRepo(tx, a);
      const n = await repo.create(nota());
      await repo.update(n.id, { estado: 'para_revisar', resuelta_at: null });

      const cerrada = await repo.update(n.id, { estado: 'corregida', resuelta_at: new Date() });
      expect(cerrada.estado).toBe('corregida');
      expect(cerrada.resuelta_at).not.toBeNull();

      const reabierta = await repo.update(n.id, { estado: 'abierta', resuelta_at: null });
      expect(reabierta.resuelta_at).toBeNull();
    });
  });

  it('update de texto, tipo, respuesta y modo', async () => {
    await withRollback(async (tx) => {
      const a = await seedUser(tx);
      const repo = makeTestNotesRepo(tx, a);
      const n = await repo.create(nota({ modo: ['debatir'] }));
      const u = await repo.update(n.id, {
        texto: 'otro',
        tipo: 'mejora',
        respuesta: 'listo',
        modo: [],
      });
      expect(u).toMatchObject({ texto: 'otro', tipo: 'mejora', respuesta: 'listo', modo: [] });
    });
  });

  it('update y remove de un id inexistente → 404', async () => {
    await withRollback(async (tx) => {
      const a = await seedUser(tx);
      const repo = makeTestNotesRepo(tx, a);
      await expect(repo.update(999_999_999, { texto: 'x' })).rejects.toMatchObject({
        statusCode: 404,
      });
      await expect(repo.remove(999_999_999)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  it('remove borra la nota y no vuelve en el listado', async () => {
    await withRollback(async (tx) => {
      const a = await seedUser(tx);
      const repo = makeTestNotesRepo(tx, a);
      const n = await repo.create(nota());
      expect(await repo.remove(n.id)).toEqual({ id: n.id });
      expect((await repo.list({})).some((x) => x.id === n.id)).toBe(false);
    });
  });

  it('el CHECK de la tabla rechaza un estado fuera de la lista', async () => {
    await withRollback(async (tx) => {
      const a = await seedUser(tx);
      const n = await makeTestNotesRepo(tx, a).create(nota());
      await expect(
        tx.$executeRaw`UPDATE test_notes SET estado = 'rara' WHERE id = ${n.id}`,
      ).rejects.toThrow();
    });
  });
});

describe('notas compartidas entre cuentas (A6)', () => {
  it('el repo de B lista la nota de A con autor = email de A', async () => {
    await withRollback(async (tx) => {
      const a = await seedUser(tx, 'autor-a@test.example');
      const b = await seedUser(tx, 'b@test.example');
      const deA = await makeTestNotesRepo(tx, a).create(nota());

      const vistaDeB = await makeTestNotesRepo(tx, b).list({});
      const encontrada = vistaDeB.find((n) => n.id === deA.id);
      expect(encontrada?.autor).toBe('autor-a@test.example');
      expect(encontrada?.user_id).toBe(a);
    });
  });

  it('el repo de B actualiza y borra la nota de A sin cambiar user_id', async () => {
    await withRollback(async (tx) => {
      const a = await seedUser(tx, 'autor-a@test.example');
      const b = await seedUser(tx, 'b@test.example');
      const deA = await makeTestNotesRepo(tx, a).create(nota());
      const repoB = makeTestNotesRepo(tx, b);

      const u = await repoB.update(deA.id, { estado: 'en_curso', resuelta_at: null });
      expect(u.estado).toBe('en_curso');
      expect(u.user_id).toBe(a);
      expect(u.autor).toBe('autor-a@test.example');

      expect(await repoB.remove(deA.id)).toEqual({ id: deA.id });
    });
  });
});

describe('makeTestNotesAdminRepo', () => {
  it('listVivas devuelve solo vivas (de cualquier autor) por id ascendente', async () => {
    await withRollback(async (tx) => {
      const a = await seedUser(tx);
      const b = await seedUser(tx);
      const n1 = await makeTestNotesRepo(tx, a).create(nota());
      const n2 = await makeTestNotesRepo(tx, b).create(nota());
      const cerrada = await makeTestNotesRepo(tx, a).create(nota());
      const admin = makeTestNotesAdminRepo(tx);
      await admin.setEstado(cerrada.id, 'descartada');

      const ids = (await admin.listVivas()).map((n) => n.id);
      expect(ids).toContain(n1.id);
      expect(ids).toContain(n2.id);
      expect(ids).not.toContain(cerrada.id);
      expect(ids.indexOf(n1.id)).toBeLessThan(ids.indexOf(n2.id));
    });
  });

  it('get devuelve la nota con autor; inexistente → 404', async () => {
    await withRollback(async (tx) => {
      const a = await seedUser(tx, 'a@test.example');
      const n = await makeTestNotesRepo(tx, a).create(nota());
      const admin = makeTestNotesAdminRepo(tx);
      expect(await admin.get(n.id)).toMatchObject({ id: n.id, autor: 'a@test.example' });
      await expect(admin.get(999_999_999)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  it('setEstado cambia estado, resuelta_at y respuesta solo si viene', async () => {
    await withRollback(async (tx) => {
      const a = await seedUser(tx);
      const n = await makeTestNotesRepo(tx, a).create(nota());
      const admin = makeTestNotesAdminRepo(tx);

      await admin.setEstado(n.id, 'para_revisar', 'Listo');
      expect(await admin.get(n.id)).toMatchObject({
        estado: 'para_revisar',
        respuesta: 'Listo',
        resuelta_at: null,
      });

      await admin.setEstado(n.id, 'corregida');
      const cerrada = await admin.get(n.id);
      expect(cerrada.estado).toBe('corregida');
      expect(cerrada.respuesta).toBe('Listo');
      expect(cerrada.resuelta_at).not.toBeNull();

      await expect(admin.setEstado(999_999_999, 'abierta')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});
