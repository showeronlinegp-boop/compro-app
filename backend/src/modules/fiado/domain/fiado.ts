/**
 * Dominio del módulo Fiado — puro, sin DB ni Nest.
 *
 * Libro append-only: un movimiento nunca se edita ni se borra. `monto` es el
 * EFECTO sobre lo que te deben (con signo): fiado > 0, pago < 0 y una
 * corrección vale exactamente el opuesto del movimiento que corrige. Por eso
 * `saldo = Σ monto` y "Deshacer" no hace desaparecer nada.
 */

export type TipoMovimiento = 'fiado' | 'pago' | 'correccion' | 'recargo';

/** Máximo que acepta el teclado: 9 dígitos. */
export const MONTO_MAX = 999_999_999;

/** Zona horaria del negocio: "hoy" y los días se cuentan en hora argentina. */
export const TZ = 'America/Argentina/Buenos_Aires';

export interface MovimientoLedger {
  id: number;
  cliente_id: number;
  tipo: TipoMovimiento;
  monto: number;
  corrige_id: number | null;
  /** Sólo en un fiado: 'AAAA-MM-DD' en que te lo tienen que pagar. */
  vence: string | null;
  created_at: Date;
  /** Sólo en un recargo: el fiado al que pertenece. */
  recargo_de?: number | null;
  /** Sólo en un recargo: días de atraso que cubre. */
  recargo_dias?: number | null;
}

// ─── Errores de dominio ───────────────────────────────────────────────────────

/** Error con status HTTP; el controller lo traduce a HttpException. */
export class FiadoError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = 'FiadoError';
  }
}

// ─── Fechas ───────────────────────────────────────────────────────────────────

const ymdFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Fecha calendario argentina de un instante: '2026-10-13'. */
export function fechaAR(d: Date): string {
  return ymdFormat.format(d);
}

/** Días calendario entre dos fechas 'YYYY-MM-DD' (b − a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** 'YYYY-MM-DD' + n días. */
export function sumarDias(ymd: string, n: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

// ─── Libro ────────────────────────────────────────────────────────────────────

/** Lo que te debe el cliente. Negativo = tiene saldo a favor. */
export function saldo(movs: readonly MovimientoLedger[]): number {
  return movs.reduce((acc, m) => acc + m.monto, 0);
}

/** Ids de movimientos que ya tienen corrección. */
export function idsCorregidos(movs: readonly MovimientoLedger[]): Set<number> {
  const out = new Set<number>();
  for (const m of movs) if (m.corrige_id != null) out.add(m.corrige_id);
  return out;
}

/**
 * Días sin pagar (decisión 2026-10-13): desde el último pago; si nunca pagó,
 * desde el primer fiado. Sólo con saldo > 0 (si no, `null`). Los movimientos
 * corregidos y las correcciones no cuentan.
 */
export function diasSinPagar(movs: readonly MovimientoLedger[], hoy: string): number | null {
  if (saldo(movs) <= 0) return null;
  const corregidos = idsCorregidos(movs);
  const vigentes = movs.filter((m) => m.tipo !== 'correccion' && !corregidos.has(m.id));
  const ultimoPago = maxFecha(vigentes.filter((m) => m.tipo === 'pago'));
  const desde = ultimoPago ?? minFecha(vigentes.filter((m) => m.tipo === 'fiado'));
  if (!desde) return null;
  return Math.max(0, diasEntre(fechaAR(desde), hoy));
}

function maxFecha(movs: readonly MovimientoLedger[]): Date | null {
  let out: Date | null = null;
  for (const m of movs) if (!out || m.created_at > out) out = m.created_at;
  return out;
}

function minFecha(movs: readonly MovimientoLedger[]): Date | null {
  let out: Date | null = null;
  for (const m of movs) if (!out || m.created_at < out) out = m.created_at;
  return out;
}

/** Pasó el límite: sólo si hay límite cargado. Informa, no bloquea. */
export function excedeLimite(s: number, limite: number | null): boolean {
  return limite != null && s > limite;
}

// ─── Vencimientos (nota de prueba #3) ─────────────────────────────────────────

/** Lo que falta pagar de un fiado (o de un recargo) vigente y cuándo vence. */
export interface FiadoPendiente {
  id: number;
  /**
   * Fecha efectiva: la elegida al anotar o, sin fecha, el día +`umbralDias`.
   * Un recargo vence el día que se suma.
   */
  vence: string;
  pendiente: number;
  /** En un recargo: el fiado al que pertenece; en un fiado, null. */
  recargo_de: number | null;
}

/**
 * Imputa los pagos (decisión 2026-10-18): un pago no dice qué fiado paga, así
 * que se calcula. Lo pagado tapa primero el fiado que vence antes (empate: el
 * más viejo) y enseguida SUS recargos; recién después pasa al siguiente fiado
 * (recargos por atraso: primero la deuda, después su recargo, así el fiado deja
 * de generar recargos cuanto antes). Un fiado sin fecha vence a los
 * `umbralDias` de anotado ("deuda vieja"). Los movimientos corregidos y las
 * correcciones no cuentan. Devuelve fiados y recargos vigentes, en ese orden.
 */
export function imputarFiados(
  movs: readonly MovimientoLedger[],
  umbralDias: number,
): FiadoPendiente[] {
  const corregidos = idsCorregidos(movs);
  const vigentes = movs.filter((m) => m.tipo !== 'correccion' && !corregidos.has(m.id));
  let pagado = -vigentes.filter((m) => m.tipo === 'pago').reduce((acc, m) => acc + m.monto, 0);
  const porFecha = (a: MovimientoLedger, b: MovimientoLedger) =>
    a.created_at.getTime() - b.created_at.getTime() || a.id - b.id;
  const fiados = vigentes
    .filter((m) => m.tipo === 'fiado')
    .map((m) => ({ m, vence: m.vence ?? sumarDias(fechaAR(m.created_at), umbralDias) }))
    .sort((a, b) => a.vence.localeCompare(b.vence) || porFecha(a.m, b.m));
  const recargos = vigentes.filter((m) => m.tipo === 'recargo').sort(porFecha);

  const orden: { m: MovimientoLedger; vence: string }[] = [];
  const ubicados = new Set<number>();
  for (const f of fiados) {
    orden.push(f);
    for (const r of recargos.filter((r) => r.recargo_de === f.m.id)) {
      orden.push({ m: r, vence: fechaAR(r.created_at) });
      ubicados.add(r.id);
    }
  }
  // Un recargo cuyo fiado ya no está vigente (no debería pasar: deshacer un
  // fiado deshace sus recargos) se cobra al final.
  for (const r of recargos.filter((r) => !ubicados.has(r.id))) {
    orden.push({ m: r, vence: fechaAR(r.created_at) });
  }

  return orden.map(({ m, vence }) => {
    const cubre = Math.min(pagado, m.monto);
    pagado -= cubre;
    return {
      id: m.id,
      vence,
      pendiente: m.monto - cubre,
      recargo_de: m.tipo === 'recargo' ? (m.recargo_de ?? null) : null,
    };
  });
}

/** La fecha más temprana de una lista, o null. */
function minVence(ps: readonly FiadoPendiente[]): string | null {
  return ps.reduce<string | null>(
    (min, p) => (min === null || p.vence < min ? p.vence : min),
    null,
  );
}

export interface Vencimientos {
  /** Lo que ya tendría que haber pagado (vence hoy o antes). */
  vencido: number;
  /** Fecha del vencimiento vencido más viejo, o null. */
  vencido_desde: string | null;
  /** El próximo vencimiento que todavía no llegó. */
  proximo: { fecha: string; monto: number } | null;
}

export function vencimientos(pendientes: readonly FiadoPendiente[], hoy: string): Vencimientos {
  const deben = pendientes.filter((p) => p.pendiente > 0);
  const vencidos = deben.filter((p) => p.vence <= hoy);
  const futuros = deben.filter((p) => p.vence > hoy);
  const fecha = minVence(futuros);
  return {
    vencido: vencidos.reduce((acc, p) => acc + p.pendiente, 0),
    vencido_desde: minVence(vencidos),
    proximo: fecha
      ? {
          fecha,
          monto: futuros.filter((p) => p.vence === fecha).reduce((acc, p) => acc + p.pendiente, 0),
        }
      : null,
  };
}

/** "Para cobrar hoy": tiene algo vencido (hoy o antes). */
export function paraCobrarHoy(v: Pick<Vencimientos, 'vencido'>): boolean {
  return v.vencido > 0;
}

/** Ventana de "Próximos días" en los avisos. */
export const DIAS_PROXIMOS = 7;

/**
 * Valida que `original` se pueda corregir y devuelve el monto de la
 * corrección. Un movimiento se corrige una sola vez y una corrección no se
 * corrige.
 */
export function montoCorreccion(
  original: Pick<MovimientoLedger, 'tipo' | 'monto'>,
  yaCorregido: boolean,
): number {
  if (original.tipo === 'correccion') {
    throw new FiadoError(409, 'Una corrección no se puede deshacer');
  }
  if (yaCorregido) throw new FiadoError(409, 'Ese movimiento ya fue corregido');
  return -original.monto;
}

/** Lo que falta pagar de recargos (para el recordatorio: "incluye $ X de recargos"). */
export function recargosPendientes(pendientes: readonly FiadoPendiente[]): number {
  return pendientes.filter((p) => p.recargo_de !== null).reduce((acc, p) => acc + p.pendiente, 0);
}

/** Monto con signo según el tipo: fiado suma, pago resta. */
export function montoConSigno(tipo: 'fiado' | 'pago', monto: number): number {
  return tipo === 'fiado' ? monto : -monto;
}

// ─── Formato y mensajes ───────────────────────────────────────────────────────

/** `$ 42.300` (mismo formato que el front, guía §2.2). */
export function formatMoney(n: number): string {
  return `$ ${Math.round(Math.abs(n)).toLocaleString('es-AR')}`;
}

/** Saldo para un mensaje: `$ 42.300`, o `$ 500 a favor` si es negativo. */
export function formatSaldo(n: number): string {
  return n < 0 ? `${formatMoney(n)} a favor` : formatMoney(n);
}

/** Sólo el primer nombre: "Marta Giménez" → "Marta". */
export function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? '';
}

export const PLANTILLAS_DEFAULT = {
  fiado:
    'Hola {nombre}, anoté {monto} en tu cuenta de {comercio}. Tu saldo es {saldo}.\n\nHecho con Neggo',
  pago: 'Hola {nombre}, registré tu pago de {monto}. Tu saldo es {saldo}. ¡Gracias!\n\nHecho con Neggo',
  recordatorio:
    'Hola {nombre}, te recuerdo que tenés un saldo de {saldo} en {comercio}. Podés pagar por transferencia al alias {alias}. ¡Gracias!\n\nHecho con Neggo',
} as const;

export const FIRMA = 'Hecho con Neggo';

/**
 * Reemplaza `{variable}` por su valor; las desconocidas quedan como están.
 * Siempre termina con la firma (guía §4.9), aunque la plantilla la haya borrado.
 */
export function renderPlantilla(plantilla: string, vars: Record<string, string>): string {
  const texto = plantilla.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
  return texto.trimEnd().endsWith(FIRMA) ? texto : `${texto.trimEnd()}\n\n${FIRMA}`;
}

// ─── Teléfono ─────────────────────────────────────────────────────────────────

/**
 * Normaliza un celular argentino al formato de `wa.me`: `549` + 10 dígitos
 * (código de área sin 0 + número sin 15). Devuelve `null` si no se puede
 * interpretar; el front abre WhatsApp sin número para elegir el contacto.
 */
export function telefonoWhatsApp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('54')) {
    d = d.slice(2);
    if (d.startsWith('9')) d = d.slice(1);
  }
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 12) d = sacar15(d) ?? d;
  return d.length === 10 ? `549${d}` : null;
}

/** "11 15 1234 5678" → "1112345678": saca el 15 que va después del código de área. */
function sacar15(d: string): string | null {
  for (const area of [2, 3, 4]) {
    if (area === 2 && !d.startsWith('11')) continue;
    if (d.slice(area, area + 2) === '15') return d.slice(0, area) + d.slice(area + 2);
  }
  return null;
}

// ─── Validación de entrada ────────────────────────────────────────────────────

export interface ClienteInput {
  nombre: string;
  telefono: string | null;
  etiqueta: string | null;
  limite: number | null;
  proximo_cobro: string | null;
  /** Sólo en la edición: no sugerirle recargos. */
  sin_recargo?: boolean;
}

const bad = (msg: string) => new FiadoError(400, msg);

function texto(v: unknown, campo: string, max: number, requerido: boolean): string | null {
  if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
    if (requerido) throw bad(`${campo} es obligatorio`);
    return null;
  }
  if (typeof v !== 'string') throw bad(`${campo} inválido`);
  const t = v.trim();
  if (t.length > max) throw bad(`${campo} no puede superar ${max} caracteres`);
  return t;
}

function enteroOpcional(v: unknown, campo: string): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > MONTO_MAX) throw bad(`${campo} inválido`);
  return n;
}

function fechaOpcional(v: unknown, campo: string): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
    throw bad(`${campo} debe tener formato AAAA-MM-DD`);
  }
  return v;
}

/** Body completo de alta de cliente. */
export function parseClienteInput(body: unknown): ClienteInput {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    nombre: texto(b.nombre, 'nombre', 80, true) as string,
    telefono: texto(b.telefono, 'telefono', 30, false),
    etiqueta: texto(b.etiqueta, 'etiqueta', 30, false),
    limite: enteroOpcional(b.limite, 'limite'),
    proximo_cobro: fechaOpcional(b.proximo_cobro, 'proximo_cobro'),
  };
}

/** Body parcial (PATCH): sólo los campos presentes. */
export function parseClientePatch(body: unknown): Partial<ClienteInput> {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: Partial<ClienteInput> = {};
  if ('nombre' in b) out.nombre = texto(b.nombre, 'nombre', 80, true) as string;
  if ('telefono' in b) out.telefono = texto(b.telefono, 'telefono', 30, false);
  if ('etiqueta' in b) out.etiqueta = texto(b.etiqueta, 'etiqueta', 30, false);
  if ('limite' in b) out.limite = enteroOpcional(b.limite, 'limite');
  if ('proximo_cobro' in b) out.proximo_cobro = fechaOpcional(b.proximo_cobro, 'proximo_cobro');
  if ('sin_recargo' in b) {
    if (typeof b.sin_recargo !== 'boolean') throw bad('sin_recargo debe ser true o false');
    out.sin_recargo = b.sin_recargo;
  }
  return out;
}

export interface MovimientoInput {
  cliente_id: number;
  tipo: 'fiado' | 'pago';
  monto: number;
  nota: string | null;
  /** Sólo en un fiado: 'AAAA-MM-DD' o null (vence como deuda vieja). */
  vence: string | null;
  idempotency_key: string | null;
}

export function parseMovimientoInput(body: unknown): MovimientoInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const cliente_id = Number(b.cliente_id);
  if (!Number.isInteger(cliente_id) || cliente_id < 1) throw bad('cliente_id inválido');
  if (b.tipo !== 'fiado' && b.tipo !== 'pago') throw bad("tipo debe ser 'fiado' o 'pago'");
  const monto = Number(b.monto);
  if (!Number.isInteger(monto) || monto < 1 || monto > MONTO_MAX) {
    throw bad(`monto debe ser un entero entre 1 y ${MONTO_MAX}`);
  }
  const vence = fechaOpcional(b.vence, 'vence');
  if (vence && b.tipo !== 'fiado') throw bad('Sólo un fiado puede tener fecha de cobro');
  return {
    cliente_id,
    tipo: b.tipo,
    monto,
    nota: texto(b.nota, 'nota', 200, false),
    vence,
    idempotency_key: texto(b.idempotency_key, 'idempotency_key', 64, false),
  };
}

export type OrdenClientes = 'deuda' | 'dias' | 'az';

export function parseOrden(v: unknown): OrdenClientes {
  if (v === undefined || v === '') return 'deuda';
  if (v === 'deuda' || v === 'dias' || v === 'az') return v;
  throw bad("orden debe ser 'deuda', 'dias' o 'az'");
}

export interface AjustesInput {
  comercio?: string;
  alias?: string | null;
  dias_deuda_vieja?: number;
  plantilla_fiado?: string | null;
  plantilla_pago?: string | null;
  plantilla_recordatorio?: string | null;
  /** Configuración del recargo tal como llega (la valida el repo, que conoce la anterior). */
  recargo?: unknown;
  /** Versión de los términos del recargo que el comercio acaba de aceptar. */
  terminos_recargo?: string;
}

/** Body parcial de ajustes. Una plantilla vacía vuelve al texto por defecto (null). */
export function parseAjustesInput(body: unknown): AjustesInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: AjustesInput = {};
  if ('comercio' in b) out.comercio = texto(b.comercio, 'comercio', 60, false) ?? '';
  if ('alias' in b) out.alias = texto(b.alias, 'alias', 60, false);
  if ('dias_deuda_vieja' in b) {
    const n = Number(b.dias_deuda_vieja);
    if (!Number.isInteger(n) || n < 1 || n > 365) throw bad('dias_deuda_vieja debe ser 1 a 365');
    out.dias_deuda_vieja = n;
  }
  for (const k of ['plantilla_fiado', 'plantilla_pago', 'plantilla_recordatorio'] as const) {
    if (k in b) out[k] = texto(b[k], k, 1000, false);
  }
  if ('recargo' in b) out.recargo = b.recargo ?? null;
  if ('terminos_recargo' in b) {
    out.terminos_recargo = texto(b.terminos_recargo, 'terminos_recargo', 20, false) ?? undefined;
  }
  return out;
}

/** Body de POST /clientes/:id/recargos: todos los sugeridos o sólo algunos fiados. */
export function parseSumarRecargos(body: unknown): {
  fiado_ids: number[] | null;
  idempotency_key: string | null;
} {
  const b = (body ?? {}) as Record<string, unknown>;
  let fiado_ids: number[] | null = null;
  if (b.fiado_ids !== undefined && b.fiado_ids !== null) {
    if (!Array.isArray(b.fiado_ids) || b.fiado_ids.length === 0 || b.fiado_ids.length > 100) {
      throw bad('fiado_ids debe ser una lista de ids');
    }
    fiado_ids = b.fiado_ids.map((v) => {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1) throw bad('fiado_ids debe ser una lista de ids');
      return n;
    });
  }
  return {
    fiado_ids,
    idempotency_key: texto(b.idempotency_key, 'idempotency_key', 64, false),
  };
}

/** Body de POST /clientes/:id/recargos/omitir. */
export function parseOmitirRecargo(body: unknown): number {
  const n = Number(((body ?? {}) as Record<string, unknown>).fiado_id);
  if (!Number.isInteger(n) || n < 1) throw bad('fiado_id inválido');
  return n;
}

/** Body de POST /clientes/:id/aviso-recargo. */
export function parseViaAviso(body: unknown): 'whatsapp' | 'informado' {
  const via = ((body ?? {}) as Record<string, unknown>).via;
  if (via !== 'whatsapp' && via !== 'informado') throw bad("via debe ser 'whatsapp' o 'informado'");
  return via;
}

/** Orden de la lista de clientes. Empates: por nombre. */
export function ordenarClientes<
  T extends { nombre: string; saldo: number; dias_sin_pagar: number | null },
>(clientes: T[], orden: OrdenClientes): T[] {
  const porNombre = (a: T, b: T) => a.nombre.localeCompare(b.nombre, 'es');
  const copia = [...clientes];
  if (orden === 'az') return copia.sort(porNombre);
  if (orden === 'dias') {
    return copia.sort(
      (a, b) => (b.dias_sin_pagar ?? -1) - (a.dias_sin_pagar ?? -1) || porNombre(a, b),
    );
  }
  return copia.sort((a, b) => b.saldo - a.saldo || porNombre(a, b));
}

/** Búsqueda por nombre sin distinguir mayúsculas ni tildes. */
export function coincideNombre(nombre: string, q: string): boolean {
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
  return norm(nombre).includes(norm(q.trim()));
}
