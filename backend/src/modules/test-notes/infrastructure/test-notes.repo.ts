import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import {
  type Estado,
  type Modo,
  type NewNote,
  type NotePatch,
  type TestNoteDto,
  type Tipo,
  VIVAS,
  resueltaAtFor,
} from '../domain/test-note.js';

// ─── Interfaces ───────────────────────────────────────────────────────────────

/**
 * Repo de la API. Notas COMPARTIDAS entre cuentas (P1): ninguna lectura ni
 * escritura filtra por `user_id`; el usuario de la request solo se usa como
 * autor en `create`.
 */
export interface TestNotesRepo {
  /** Notas de todas las cuentas: vivas primero, luego más nuevas; máximo 500. */
  list(f: { estado?: Estado; ruta?: string }): Promise<TestNoteDto[]>;
  create(n: NewNote): Promise<TestNoteDto>;
  /** 404 si no existe. Nunca toca `user_id`. */
  update(id: number, p: NotePatch): Promise<TestNoteDto>;
  /** 404 si no existe. */
  remove(id: number): Promise<{ id: number }>;
}

/** Repo del CLI (sin request ni usuario). */
export interface TestNotesAdminRepo {
  /** Notas vivas por id ascendente. */
  listVivas(): Promise<TestNoteDto[]>;
  /** 404 si no existe. */
  get(id: number): Promise<TestNoteDto>;
  /** Cambia el estado (y `resuelta_at`); `respuesta` solo se toca si viene. 404 si no existe. */
  setEstado(id: number, estado: Estado, respuesta?: string | null): Promise<void>;
}

// Acepta PrismaClient o el cliente de una transacción (tests con withRollback).
type PrismaLike = Pick<PrismaClient, '$queryRaw'> & {
  test_notes: PrismaClient['test_notes'];
};

const LIMIT = 500;

function notFound(id: number): Error {
  return Object.assign(new Error(`No existe la nota #${id}`), { statusCode: 404 });
}

// ─── SQL de lectura compartido (API y CLI) ────────────────────────────────────

interface TestNoteRow {
  id: number;
  user_id: number;
  autor: string;
  tipo: string;
  estado: string;
  texto: string;
  ruta: string;
  pantalla: string | null;
  selector: string | null;
  elemento: string | null;
  pos_x: number | null;
  pos_y: number | null;
  viewport_w: number | null;
  contexto: unknown;
  modo: string[] | null;
  respuesta: string | null;
  resuelta_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const iso = (d: Date | string): string => (d instanceof Date ? d.toISOString() : d);

function parseContexto(v: unknown): Record<string, unknown> | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    try {
      return parseContexto(JSON.parse(v));
    } catch {
      return null;
    }
  }
  return typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function toDto(r: TestNoteRow): TestNoteDto {
  return {
    id: Number(r.id),
    user_id: Number(r.user_id),
    autor: r.autor,
    tipo: r.tipo as Tipo,
    estado: r.estado as Estado,
    texto: r.texto,
    ruta: r.ruta,
    pantalla: r.pantalla,
    selector: r.selector,
    elemento: r.elemento,
    pos_x: r.pos_x === null ? null : Number(r.pos_x),
    pos_y: r.pos_y === null ? null : Number(r.pos_y),
    viewport_w: r.viewport_w === null ? null : Number(r.viewport_w),
    contexto: parseContexto(r.contexto),
    modo: (r.modo ?? []) as Modo[],
    respuesta: r.respuesta,
    resuelta_at: r.resuelta_at === null ? null : iso(r.resuelta_at),
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
  };
}

const VIVAS_SQL = Prisma.join([...VIVAS]);

/** SELECT con `autor` = email del autor o `#<user_id>`. Sin filtro por usuario (P1). */
async function selectNotas(
  prisma: PrismaLike,
  where: Prisma.Sql,
  orderBy: Prisma.Sql,
  limit: number = LIMIT,
): Promise<TestNoteDto[]> {
  const rows = await prisma.$queryRaw<TestNoteRow[]>(Prisma.sql`
    SELECT
      n.id, n.user_id,
      COALESCE(u.email, '#' || n.user_id::text) AS autor,
      n.tipo, n.estado, n.texto, n.ruta, n.pantalla, n.selector, n.elemento,
      n.pos_x, n.pos_y, n.viewport_w, n.contexto, n.modo, n.respuesta,
      n.resuelta_at, n.created_at, n.updated_at
    FROM test_notes n
    LEFT JOIN users u ON u.id = n.user_id
    WHERE ${where}
    ORDER BY ${orderBy}
    LIMIT ${limit}
  `);
  return rows.map(toDto);
}

// Vivas primero; dentro de cada grupo, la más nueva primero (id desempata
// notas creadas en la misma transacción, que comparten created_at).
const ORDEN_LISTA = Prisma.sql`(n.estado IN (${VIVAS_SQL})) DESC, n.created_at DESC, n.id DESC`;

async function getById(prisma: PrismaLike, id: number): Promise<TestNoteDto> {
  const [nota] = await selectNotas(prisma, Prisma.sql`n.id = ${id}`, Prisma.sql`n.id`, 1);
  if (!nota) throw notFound(id);
  return nota;
}

function toPrismaJson(v: Record<string, unknown> | null): Prisma.InputJsonObject | undefined {
  return v === null ? undefined : (v as Prisma.InputJsonObject);
}

// ─── Factories ────────────────────────────────────────────────────────────────

/**
 * `userId` puede ser un número o un getter (factory request-scoped: se resuelve
 * al ejecutar, después de que el guard pobló request.auth). Solo se lee en `create`.
 */
export function makeTestNotesRepo(
  prisma: PrismaLike,
  userId: number | (() => number),
): TestNotesRepo {
  const autor = () => (typeof userId === 'function' ? userId() : userId);

  return {
    list({ estado, ruta }) {
      const conds: Prisma.Sql[] = [Prisma.sql`TRUE`];
      if (estado) conds.push(Prisma.sql`n.estado = ${estado}`);
      if (ruta) conds.push(Prisma.sql`n.ruta = ${ruta}`);
      return selectNotas(prisma, Prisma.join(conds, ' AND '), ORDEN_LISTA);
    },

    async create(n) {
      const { id } = await prisma.test_notes.create({
        data: { ...n, contexto: toPrismaJson(n.contexto), user_id: autor() },
        select: { id: true },
      });
      return getById(prisma, id);
    },

    async update(id, p) {
      const { count } = await prisma.test_notes.updateMany({ where: { id }, data: p });
      if (count === 0) throw notFound(id);
      return getById(prisma, id);
    },

    async remove(id) {
      const { count } = await prisma.test_notes.deleteMany({ where: { id } });
      if (count === 0) throw notFound(id);
      return { id };
    },
  };
}

export function makeTestNotesAdminRepo(prisma: PrismaLike): TestNotesAdminRepo {
  return {
    listVivas() {
      return selectNotas(prisma, Prisma.sql`n.estado IN (${VIVAS_SQL})`, Prisma.sql`n.id`);
    },

    get(id) {
      return getById(prisma, id);
    },

    async setEstado(id, estado, respuesta) {
      const data: NotePatch = { estado, resuelta_at: resueltaAtFor(estado) };
      if (respuesta !== undefined) data.respuesta = respuesta;
      const { count } = await prisma.test_notes.updateMany({ where: { id }, data });
      if (count === 0) throw notFound(id);
    },
  };
}
