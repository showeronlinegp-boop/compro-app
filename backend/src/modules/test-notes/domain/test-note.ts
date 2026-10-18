/**
 * Notas de prueba — dominio puro (sin imports de infraestructura).
 *
 * Fuente de verdad de los valores válidos de `tipo`, `estado` y `modo` (el SQL
 * de la migración repite tipo/estado en un CHECK). Las notas son COMPARTIDAS
 * entre cuentas (decisión P1): `user_id` es solo el autor, se fija al crear y
 * ningún patch lo toca.
 *
 * Port de neggo (`routes/testNotes.js`): mismos recortes, defaults y mensajes.
 */

export const TIPOS = ['error', 'mejora', 'duda'] as const;
export const ESTADOS = [
  'abierta',
  'en_curso',
  'consulta',
  'para_revisar',
  'corregida',
  'descartada',
] as const;
/** Estados en los que la nota sigue viva (pin visible, cuenta como pendiente). */
export const VIVAS = ['abierta', 'en_curso', 'consulta', 'para_revisar'] as const;
/** Estados que cierran la nota: setean `resuelta_at`. */
export const CERRADAS = ['corregida', 'descartada'] as const;
/** Cómo quiere el usuario que se encare la nota. Sin ninguno: trabajarla directo. */
export const MODOS = ['debatir', 'investigar', 'consultas'] as const;

export type Tipo = (typeof TIPOS)[number];
export type Estado = (typeof ESTADOS)[number];
export type Modo = (typeof MODOS)[number];

/** Topes de longitud (caracteres) de lo que viene del cliente. */
export const LIMITES = {
  texto: 5000,
  ruta: 500,
  pantalla: 200,
  selector: 2000,
  elemento: 300,
  respuesta: 5000,
  contexto: 50_000,
} as const;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export interface NewNote {
  tipo: Tipo;
  texto: string;
  ruta: string;
  pantalla: string | null;
  selector: string | null;
  elemento: string | null;
  pos_x: number | null;
  pos_y: number | null;
  viewport_w: number | null;
  contexto: Record<string, unknown> | null;
  modo: Modo[];
}

export interface NotePatch {
  estado?: Estado;
  /** Derivado de `estado`: fecha al cerrar, `null` en cualquier otro estado. */
  resuelta_at?: Date | null;
  tipo?: Tipo;
  texto?: string;
  respuesta?: string | null;
  modo?: Modo[];
}

/** Nota tal como la devuelven la API y el CLI (fechas en ISO). */
export interface TestNoteDto {
  id: number;
  user_id: number;
  /** Email del autor o `#<user_id>` si no tiene. */
  autor: string;
  tipo: Tipo;
  estado: Estado;
  texto: string;
  ruta: string;
  pantalla: string | null;
  selector: string | null;
  elemento: string | null;
  pos_x: number | null;
  pos_y: number | null;
  viewport_w: number | null;
  contexto: Record<string, unknown> | null;
  modo: Modo[];
  respuesta: string | null;
  resuelta_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Guards ───────────────────────────────────────────────────────────────────

export function isTipo(v: unknown): v is Tipo {
  return typeof v === 'string' && (TIPOS as readonly string[]).includes(v);
}

export function isEstado(v: unknown): v is Estado {
  return typeof v === 'string' && (ESTADOS as readonly string[]).includes(v);
}

export function isViva(estado: Estado): boolean {
  return (VIVAS as readonly string[]).includes(estado);
}

// ─── Saneamiento de valores sueltos ───────────────────────────────────────────

/** Recorta espacios y largo; vacío o no-texto → `null`. */
export function recortar(valor: unknown, max: number): string | null {
  if (typeof valor !== 'string' && typeof valor !== 'number') return null;
  const s = String(valor).trim();
  return s ? s.slice(0, max) : null;
}

function numeroFinito(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (typeof valor === 'string' && valor.trim() !== '') {
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const INT4_MAX = 2_147_483_647;

/** Entero que entra en una columna INTEGER; si no, `null`. */
function entero(valor: unknown): number | null {
  const n = numeroFinito(valor);
  if (n === null) return null;
  const t = Math.trunc(n);
  return Math.abs(t) <= INT4_MAX ? t : null;
}

/** Solo modos conocidos, sin repetir y en orden fijo. */
export function modosSeguros(valor: unknown): Modo[] {
  if (!Array.isArray(valor)) return [];
  return MODOS.filter((m) => valor.includes(m));
}

/** El contexto viene del navegador: solo un objeto plano y que no pese demasiado. */
export function contextoSeguro(valor: unknown): Record<string, unknown> | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
  let json: string;
  try {
    json = JSON.stringify(valor);
  } catch {
    return null;
  }
  return json.length <= LIMITES.contexto ? (JSON.parse(json) as Record<string, unknown>) : null;
}

/** `resuelta_at` que corresponde a un estado: fecha al cerrar, `null` si no. */
export function resueltaAtFor(estado: Estado, now: Date = new Date()): Date | null {
  return (CERRADAS as readonly string[]).includes(estado) ? now : null;
}

function asRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

// ─── Parsers de entrada (A2, A4) ──────────────────────────────────────────────

export function parseCreate(body: unknown): Parsed<NewNote> {
  const b = asRecord(body);
  const texto = recortar(b.texto, LIMITES.texto);
  if (!texto) return { ok: false, error: 'Escribí qué pasó' };
  const ruta = recortar(b.ruta, LIMITES.ruta);
  if (!ruta) return { ok: false, error: 'Falta la pantalla de la nota' };

  return {
    ok: true,
    value: {
      tipo: isTipo(b.tipo) ? b.tipo : 'error',
      texto,
      ruta,
      pantalla: recortar(b.pantalla, LIMITES.pantalla),
      selector: recortar(b.selector, LIMITES.selector),
      elemento: recortar(b.elemento, LIMITES.elemento),
      pos_x: numeroFinito(b.pos_x),
      pos_y: entero(b.pos_y),
      viewport_w: entero(b.viewport_w),
      contexto: contextoSeguro(b.contexto),
      modo: modosSeguros(b.modo),
    },
  };
}

export function parsePatch(body: unknown, now: Date = new Date()): Parsed<NotePatch> {
  const b = asRecord(body);
  const patch: NotePatch = {};

  if (b.estado !== undefined) {
    if (!isEstado(b.estado)) return { ok: false, error: 'Estado inválido' };
    patch.estado = b.estado;
    patch.resuelta_at = resueltaAtFor(b.estado, now);
  }
  if (b.tipo !== undefined) {
    if (!isTipo(b.tipo)) return { ok: false, error: 'Tipo inválido' };
    patch.tipo = b.tipo;
  }
  if (b.texto !== undefined) {
    const texto = recortar(b.texto, LIMITES.texto);
    if (!texto) return { ok: false, error: 'La nota no puede quedar vacía' };
    patch.texto = texto;
  }
  if (b.respuesta !== undefined) patch.respuesta = recortar(b.respuesta, LIMITES.respuesta);
  if (b.modo !== undefined) patch.modo = modosSeguros(b.modo);

  if (Object.keys(patch).length === 0) return { ok: false, error: 'Nada para actualizar' };
  return { ok: true, value: patch };
}
