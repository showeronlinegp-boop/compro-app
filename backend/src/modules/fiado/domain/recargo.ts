/**
 * Recargos por atraso — dominio puro, sin DB ni Nest.
 *
 * Reglas (propuesta "Recargos por atraso", decisiones del 30/10/2026):
 * - El recargo se SUGIERE; nunca se suma solo. Es un movimiento más del libro,
 *   pegado al fiado que lo generó (`recargo_de`).
 * - Cada fiado tiene su propio calendario: los días de atraso se cuentan desde
 *   SU vencimiento (o desde el día de activación, si el comercio lo eligió).
 *   La tolerancia es sólo un período de gracia: no hay sugerencias mientras
 *   dura, pero los períodos se cuentan desde el vencimiento.
 * - Se guardan DÍAS de atraso, no montos ni números de período: cada recargo
 *   y cada "No cobrar" cubren el atraso hasta un día. Con el esquema vigente
 *   eso se traduce al período ya tratado (un cambio de esquema no confunde
 *   "semana 10" con "mes 10"). Lo que se sugiere son los períodos todavía no
 *   tratados, sobre lo que falta pagar de ese fiado: un pago parcial achica
 *   los recargos siguientes sin hacer desaparecer ninguno.
 * - Nunca hay recargo sobre recargo: la base es sólo el capital pendiente.
 * - Montos redondeados a múltiplos de $ 10, siempre hacia abajo (a favor del cliente).
 */

import { FIRMA, FiadoError, diasEntre, formatMoney, primerNombre } from './fiado.js';

// ─── Configuración ────────────────────────────────────────────────────────────

export type EsquemaRecargo = 'mes' | 'semana' | 'tramos';

export interface TramoRecargo {
  /** Último día de atraso del tramo; null = "más de …" (sólo el último). */
  hasta: number | null;
  /** Porcentaje TOTAL del tramo (no se suma a los anteriores). */
  pct: number;
}

export interface ConfigRecargo {
  esquema: EsquemaRecargo;
  /** Sólo mes/semana: porcentaje sobre lo vencido o monto fijo en pesos. */
  tipo?: 'pct' | 'fijo';
  /** Sólo mes/semana: el porcentaje (ej. 5 o 2.5) o el monto fijo. */
  valor?: number;
  /** Sólo tramos: de 1 a 3, ordenados por `hasta`. */
  tramos?: TramoRecargo[];
  /** Días de gracia después del vencimiento. */
  tolerancia: number;
  /** Desde cuándo se cuentan los atrasos de las deudas anteriores a activar. */
  desde: 'vencimiento' | 'activacion';
  /** 'AAAA-MM-DD' del día en que se activó (lo pone el servidor). */
  activado_el: string;
}

export const TRAMOS_MAX = 3;
export const PCT_MAX = 100;
export const FIJO_MAX = 9_999_999;
export const TOLERANCIA_MAX = 90;

const bad = (msg: string) => new FiadoError(400, msg);

function numero(v: unknown, campo: string, min: number, max: number, decimales: boolean): number {
  const n = Number(v);
  const okFormato = decimales
    ? Number.isFinite(n) && Math.round(n * 100) === n * 100
    : Number.isInteger(n);
  if (v === null || v === undefined || v === '' || !okFormato || n < min || n > max) {
    throw bad(`${campo} inválido`);
  }
  return n;
}

/**
 * Valida la configuración que manda el front (sin `activado_el`, que pone el
 * servidor). `null` = apagar.
 */
export function parseConfigRecargo(
  v: unknown,
  hoy: string,
  anterior: ConfigRecargo | null,
): ConfigRecargo | null {
  if (v === null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) throw bad('recargo inválido');
  const b = v as Record<string, unknown>;
  if (b.esquema !== 'mes' && b.esquema !== 'semana' && b.esquema !== 'tramos') {
    throw bad("recargo.esquema debe ser 'mes', 'semana' o 'tramos'");
  }
  const tolerancia = numero(b.tolerancia ?? 0, 'recargo.tolerancia', 0, TOLERANCIA_MAX, false);
  if (b.desde !== undefined && b.desde !== 'vencimiento' && b.desde !== 'activacion') {
    throw bad("recargo.desde debe ser 'vencimiento' o 'activacion'");
  }
  const desde = (b.desde as ConfigRecargo['desde'] | undefined) ?? 'vencimiento';
  // Si ya estaba activo se conserva la fecha de activación; si no, es hoy.
  const activado_el = anterior?.activado_el ?? hoy;

  if (b.esquema === 'tramos') {
    if (!Array.isArray(b.tramos) || b.tramos.length < 1 || b.tramos.length > TRAMOS_MAX) {
      throw bad(`recargo.tramos debe tener entre 1 y ${TRAMOS_MAX} tramos`);
    }
    const tramos = b.tramos.map((t, i): TramoRecargo => {
      const r = (t ?? {}) as Record<string, unknown>;
      const ultimo = i === (b.tramos as unknown[]).length - 1;
      const hasta =
        ultimo && (r.hasta === null || r.hasta === undefined)
          ? null
          : numero(r.hasta, `recargo.tramos[${i}].hasta`, 1, 3650, false);
      return { hasta, pct: numero(r.pct, `recargo.tramos[${i}].pct`, 0.01, PCT_MAX, true) };
    });
    for (let i = 1; i < tramos.length; i++) {
      const prev = tramos[i - 1] as TramoRecargo;
      const cur = tramos[i] as TramoRecargo;
      if (prev.hasta === null || (cur.hasta !== null && cur.hasta <= prev.hasta)) {
        throw bad('Los tramos tienen que ir de menos a más días');
      }
      if (cur.pct < prev.pct) throw bad('El porcentaje de un tramo no puede ser menor al anterior');
    }
    return { esquema: 'tramos', tramos, tolerancia, desde, activado_el };
  }

  if (b.tipo !== 'pct' && b.tipo !== 'fijo') throw bad("recargo.tipo debe ser 'pct' o 'fijo'");
  const valor =
    b.tipo === 'pct'
      ? numero(b.valor, 'recargo.valor', 0.01, PCT_MAX, true)
      : numero(b.valor, 'recargo.valor', 10, FIJO_MAX, false);
  return { esquema: b.esquema, tipo: b.tipo, valor, tolerancia, desde, activado_el };
}

/**
 * ¿El cambio de `anterior` a `nuevo` obliga a volver a avisar a los clientes?
 * Sí al activar, al subir el porcentaje o el monto, al cambiar de esquema (o
 * de porcentaje a fijo) y al achicar la gracia. No al apagar ni al bajar.
 */
export function requiereAviso(
  anterior: ConfigRecargo | null,
  nuevo: ConfigRecargo | null,
): boolean {
  if (!nuevo) return false;
  if (!anterior) return true;
  if (nuevo.esquema !== anterior.esquema) return true;
  if (nuevo.tolerancia < anterior.tolerancia) return true;
  if (nuevo.desde === 'vencimiento' && anterior.desde === 'activacion') return true;
  if (nuevo.esquema === 'tramos') {
    const a = anterior.tramos ?? [];
    const n = nuevo.tramos ?? [];
    if (n.length !== a.length) return true;
    return n.some((t, i) => {
      const prev = a[i] as TramoRecargo;
      const empiezaAntes = t.hasta !== null && (prev.hasta === null || t.hasta < prev.hasta);
      return t.pct > prev.pct || empiezaAntes;
    });
  }
  if (nuevo.tipo !== anterior.tipo) return true;
  return (nuevo.valor ?? 0) > (anterior.valor ?? 0);
}

// ─── Textos (el aviso, el comprobante y Ajustes dicen exactamente lo mismo) ──

/** "5 %" / "2,5 %". */
export function formatPct(n: number): string {
  return `${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })} %`;
}

function gracia(dias: number): string {
  if (dias === 0) return 'desde el día siguiente al vencimiento';
  return `después de ${dias} ${dias === 1 ? 'día' : 'días'} de gracia`;
}

/**
 * Las condiciones en una frase: "un recargo del 5 % por cada mes de atraso,
 * después de 7 días de gracia".
 */
export function condicionesTexto(c: ConfigRecargo): string {
  if (c.esquema === 'tramos') {
    const tramos = c.tramos ?? [];
    const partes = tramos.map((t, i) => {
      const desdeDia = i === 0 ? 1 : ((tramos[i - 1] as TramoRecargo).hasta ?? 0) + 1;
      if (t.hasta === null) return `del ${formatPct(t.pct)} con más de ${desdeDia - 1} días`;
      if (i === 0) return `del ${formatPct(t.pct)} hasta los ${t.hasta} días`;
      return `del ${formatPct(t.pct)} de ${desdeDia} a ${t.hasta} días`;
    });
    const lista =
      partes.length > 1
        ? `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
        : (partes[0] ?? '');
    return `un recargo ${lista} de atraso (en total, no se suman), ${gracia(c.tolerancia)}`;
  }
  const periodo = c.esquema === 'mes' ? 'mes' : 'semana';
  const cuanto =
    c.tipo === 'fijo' ? `de ${formatMoney(c.valor ?? 0)}` : `del ${formatPct(c.valor ?? 0)}`;
  return `un recargo ${cuanto} por cada ${periodo} de atraso, ${gracia(c.tolerancia)}`;
}

/** Mensaje fijo del aviso de condiciones (no editable). */
export function textoAvisoRecargo(
  c: ConfigRecargo,
  comercio: string,
  nombreCliente: string,
): string {
  const donde = comercio.trim() ? `en ${comercio.trim()}` : 'en mi comercio';
  return `Hola ${primerNombre(nombreCliente)}, te aviso que ${donde} los fiados que se atrasen tienen ${condicionesTexto(c)}.\n\n${FIRMA}`;
}

// ─── Períodos ─────────────────────────────────────────────────────────────────

/** Fecha desde la que se cuentan los días de atraso de un fiado. */
export function inicioAtraso(vence: string, c: ConfigRecargo): string {
  return c.desde === 'activacion' && c.activado_el > vence ? c.activado_el : vence;
}

/**
 * Período de atraso (1, 2, …) para `dias` de atraso, o 0 si no hay atraso.
 * Mes = cada 30 días; semana = cada 7; tramos = índice del tramo (1-based).
 */
export function periodoDe(dias: number, c: ConfigRecargo): number {
  if (dias <= 0) return 0;
  if (c.esquema === 'mes') return Math.ceil(dias / 30);
  if (c.esquema === 'semana') return Math.ceil(dias / 7);
  const tramos = c.tramos ?? [];
  const i = tramos.findIndex((t) => t.hasta === null || dias <= t.hasta);
  return i === -1 ? tramos.length : i + 1;
}

/** Hacia abajo, a múltiplos de $ 10 (a favor del cliente). */
export function redondear10(n: number): number {
  return Math.floor(n / 10) * 10;
}

/** Porcentaje del tramo `periodo` (0 si es 0). */
function pctTramo(c: ConfigRecargo, periodo: number): number {
  return periodo <= 0 ? 0 : ((c.tramos ?? [])[periodo - 1]?.pct ?? 0);
}

function nombrePeriodo(c: ConfigRecargo, desde: number, hasta: number): string {
  if (c.esquema === 'tramos') {
    const t = (c.tramos ?? [])[hasta - 1];
    const prev = (c.tramos ?? [])[hasta - 2];
    if (!t) return `tramo ${hasta}`;
    if (t.hasta === null) return `más de ${prev?.hasta ?? 0} días`;
    return hasta === 1 ? `hasta ${t.hasta} días` : `${(prev?.hasta ?? 0) + 1} a ${t.hasta} días`;
  }
  const unidad = c.esquema === 'mes' ? 'mes' : 'semana';
  const plural = c.esquema === 'mes' ? 'meses' : 'semanas';
  return desde === hasta ? `${unidad} ${hasta}` : `${plural} ${desde} a ${hasta}`;
}

// ─── Sugerencia ───────────────────────────────────────────────────────────────

/** Un fiado vigente con lo que le falta pagar (después de imputar los pagos). */
export interface FiadoParaRecargo {
  id: number;
  /** 'AAAA-MM-DD' en que se anotó. */
  fecha: string;
  /** Vencimiento efectivo (elegido o por deuda vieja). */
  vence: string;
  /** Capital que falta pagar (sin recargos). */
  pendiente: number;
}

export interface RecargoSugerido {
  fiado_id: number;
  fiado_fecha: string;
  vence: string;
  /** Capital sobre el que se calcula. */
  base: number;
  /** Días de atraso hoy: es lo que se guarda en el recargo (o en "No cobrar"). */
  dias_atraso: number;
  periodo_desde: number;
  periodo_hasta: number;
  monto: number;
  /** "5 % de $ 12.000 · mes 1" — va en la nota del movimiento. */
  detalle: string;
}

/**
 * Recargos que corresponde sugerir hoy, uno por fiado. `tratados` = días de
 * atraso ya tratados de cada fiado (con un recargo vigente o "No cobrar").
 */
export function recargosSugeridos(
  fiados: readonly FiadoParaRecargo[],
  tratados: ReadonlyMap<number, number>,
  c: ConfigRecargo,
  hoy: string,
): RecargoSugerido[] {
  const out: RecargoSugerido[] = [];
  for (const f of fiados) {
    if (f.pendiente <= 0) continue;
    const dias = diasEntre(inicioAtraso(f.vence, c), hoy);
    if (dias <= c.tolerancia) continue;
    const periodo = periodoDe(dias, c);
    const tratado = periodoDe(tratados.get(f.id) ?? 0, c);
    if (periodo <= tratado) continue;

    let bruto: number;
    let como: string;
    if (c.esquema === 'tramos') {
      const pct = pctTramo(c, periodo) - pctTramo(c, tratado);
      bruto = (f.pendiente * pct) / 100;
      como =
        tratado > 0
          ? `${formatPct(pctTramo(c, periodo))} de ${formatMoney(f.pendiente)} menos el tramo anterior (${formatPct(pctTramo(c, tratado))})`
          : `${formatPct(pctTramo(c, periodo))} de ${formatMoney(f.pendiente)}`;
    } else if (c.tipo === 'fijo') {
      bruto = (c.valor ?? 0) * (periodo - tratado);
      como = `${formatMoney(c.valor ?? 0)} por ${c.esquema === 'mes' ? 'mes' : 'semana'}`;
    } else {
      bruto = (f.pendiente * (c.valor ?? 0) * (periodo - tratado)) / 100;
      como = `${formatPct(c.valor ?? 0)} de ${formatMoney(f.pendiente)}`;
    }
    const monto = redondear10(bruto);
    if (monto <= 0) continue;
    out.push({
      fiado_id: f.id,
      fiado_fecha: f.fecha,
      vence: f.vence,
      base: f.pendiente,
      dias_atraso: dias,
      periodo_desde: tratado + 1,
      periodo_hasta: periodo,
      monto,
      detalle: `${como} · ${nombrePeriodo(c, tratado + 1, periodo)}`,
    });
  }
  return out;
}
