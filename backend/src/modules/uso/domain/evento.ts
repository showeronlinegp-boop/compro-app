/**
 * Eventos de uso que manda el front (panel de admin, fase 2) — puro.
 *
 * Sólo se registra QUÉ pantalla o acción, nunca con qué datos: ni ids de
 * clientes, ni nombres, ni montos. Por eso la pantalla va como `ruta_id`
 * ('ficha') y no como path ('/fiado/clientes/12').
 */

/** 'pantalla' = abrió una pantalla; el resto, acciones que no dejan otro rastro. */
export const EVENTOS = ['pantalla', 'comprobante', 'instalar'] as const;
export type Evento = (typeof EVENTOS)[number];

/** Máximo de eventos por envío: el front junta unos segundos y manda. */
export const LOTE_MAX = 50;

/** Días que se guardan los eventos (un año y un mes, para comparar contra el año anterior). */
export const DIAS_RETENCION = 400;

/** Ids de módulo y de ruta: minúsculas, números y guiones (como en el registry del front). */
const ID_RE = /^[a-z][a-z0-9-]{0,39}$/;

export interface EventoInput {
  evento: Evento;
  modulo: string;
  ruta_id: string | null;
}

export interface Lote {
  eventos: EventoInput[];
  standalone: boolean;
  movil: boolean;
}

export class LoteInvalido extends Error {}

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function parseEvento(raw: unknown): EventoInput {
  if (!esObjeto(raw)) throw new LoteInvalido('evento inválido');
  const { evento, modulo, ruta_id } = raw;
  if (!EVENTOS.includes(evento as Evento)) throw new LoteInvalido('evento desconocido');
  if (typeof modulo !== 'string' || !ID_RE.test(modulo)) throw new LoteInvalido('modulo inválido');
  if (
    ruta_id !== undefined &&
    ruta_id !== null &&
    (typeof ruta_id !== 'string' || !ID_RE.test(ruta_id))
  ) {
    throw new LoteInvalido('ruta_id inválido');
  }
  if (evento === 'pantalla' && !ruta_id) throw new LoteInvalido('una pantalla necesita ruta_id');
  return { evento: evento as Evento, modulo, ruta_id: (ruta_id as string | undefined) ?? null };
}

/** Valida el body de `POST /api/uso/eventos`. Lanza LoteInvalido. */
export function parseLote(body: unknown): Lote {
  if (!esObjeto(body) || !Array.isArray(body.eventos)) throw new LoteInvalido('falta eventos');
  if (body.eventos.length === 0) throw new LoteInvalido('lote vacío');
  if (body.eventos.length > LOTE_MAX) throw new LoteInvalido(`máximo ${LOTE_MAX} eventos`);
  return {
    eventos: body.eventos.map(parseEvento),
    standalone: body.standalone === true,
    movil: body.movil === true,
  };
}
