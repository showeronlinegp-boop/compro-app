/**
 * Dominio del panel de uso — puro, sin DB ni Nest.
 *
 * Todo sale de lo que la base ya registra: altas, clientes, movimientos del
 * libro (append-only), recordatorios y ajustes. Las lecturas (abrir una
 * pantalla sin anotar nada) NO quedan registradas: "activo" acá significa
 * "hizo algo", y el último ingreso a la app viene aparte, de Clerk.
 *
 * Nunca se exponen datos de los clientes del comercio (nombres, teléfonos,
 * montos): sólo conteos por comercio.
 */

import { fechaAR, sumarDias } from '../../fiado/domain/fiado.js';

/** Lo que un comercio hizo en una semana. */
export type Accion = 'cliente' | 'fiado' | 'pago' | 'correccion' | 'recordatorio';

export const ACCIONES: readonly Accion[] = [
  'cliente',
  'fiado',
  'pago',
  'correccion',
  'recordatorio',
];

/** Una fila por comercio (usuario), con lo que hizo desde el alta. */
export interface ComercioHechos {
  user_id: number;
  clerk_user_id: string;
  email: string | null;
  /** Nombre del comercio en Ajustes; '' o null = no lo configuró. */
  comercio: string | null;
  alias: boolean;
  /** Cuántas de las 3 plantillas de mensaje cambió (0–3). */
  plantillas_propias: number;
  alta: Date;
  clientes: number;
  clientes_con_telefono: number;
  clientes_con_limite: number;
  clientes_con_etiqueta: number;
  clientes_con_proximo_cobro: number;
  fiados: number;
  fiados_con_vence: number;
  pagos: number;
  correcciones: number;
  recordatorios: number;
  primer_cliente: Date | null;
  primer_fiado: Date | null;
  primer_pago: Date | null;
  primer_recordatorio: Date | null;
  /** Última vez que escribió algo (cliente, movimiento, recordatorio, ajustes). */
  ultima_actividad: Date | null;
}

/** El comercio hizo `accion` al menos una vez en la semana que empieza el lunes `semana`. */
export interface ActividadSemanal {
  user_id: number;
  /** Lunes 'AAAA-MM-DD' (hora argentina). */
  semana: string;
  accion: Accion;
}

/** Último ingreso según Clerk (abrir la app cuenta, aunque no anote nada). */
export interface Ingreso {
  last_active_at: Date | null;
  last_sign_in_at: Date | null;
}

// ─── Parámetros ───────────────────────────────────────────────────────────────

export const SEMANAS_DEFAULT = 12;
export const SEMANAS_MAX = 52;

/** `?semanas=` → 1..52 (default 12), o null si es inválido. */
export function parseSemanas(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return SEMANAS_DEFAULT;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= SEMANAS_MAX ? n : null;
}

// ─── Semanas ──────────────────────────────────────────────────────────────────

/** Lunes de la semana de `ymd` ('AAAA-MM-DD'). */
export function lunesDe(ymd: string): string {
  const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  return sumarDias(ymd, -((dow + 6) % 7));
}

/** Lunes de la primera de las `n` semanas que terminan en la de `hoy`. */
export function primeraSemana(hoy: string, n: number): string {
  return sumarDias(lunesDe(hoy), -7 * (n - 1));
}

/** Los `n` lunes que terminan en la semana de `hoy`, del más viejo al actual. */
export function ultimasSemanas(hoy: string, n: number): string[] {
  const primera = primeraSemana(hoy, n);
  return Array.from({ length: n }, (_, i) => sumarDias(primera, 7 * i));
}

// ─── Reporte ──────────────────────────────────────────────────────────────────

export interface Semana {
  semana: string;
  altas: number;
  /** Comercios que hicieron algo esa semana. */
  activos: number;
  por_accion: Record<Accion, number>;
}

export interface Cohorte {
  /** Lunes de la semana de alta. */
  semana: string;
  comercios: number;
  /** `retencion[k]` = comercios de la cohorte activos k semanas después del alta. */
  retencion: number[];
}

export interface PasoEmbudo {
  paso: string;
  comercios: number;
}

export interface Adopcion {
  funcion: string;
  /** Comercios que la usaron al menos una vez. */
  comercios: number;
  /** Sobre cuántos se mide (los que anotaron al menos un fiado). */
  de: number;
}

export interface ComercioView {
  user_id: number;
  email: string | null;
  comercio: string | null;
  alta: string;
  clientes: number;
  fiados: number;
  pagos: number;
  recordatorios: number;
  ultima_actividad: string | null;
  /** De Clerk; null si no hay dato o Clerk no respondió. */
  ultimo_ingreso: string | null;
  ultimo_login: string | null;
}

export interface UsoReporte {
  generado_at: string;
  /** 'clerk' = hay último ingreso; 'no_disponible' = Clerk no respondió. */
  ingresos: 'clerk' | 'no_disponible';
  totales: {
    comercios: number;
    /** Hicieron algo en los últimos 7 / 30 días. */
    activos_7d: number;
    activos_30d: number;
    /** Abrieron la app en los últimos 7 días (Clerk); null si no hay dato. */
    ingresaron_7d: number | null;
  };
  embudo: PasoEmbudo[];
  adopcion: Adopcion[];
  semanal: Semana[];
  cohortes: Cohorte[];
  comercios: ComercioView[];
}

const DIA_MS = 86_400_000;

const ceroPorAccion = (): Record<Accion, number> => ({
  cliente: 0,
  fiado: 0,
  pago: 0,
  correccion: 0,
  recordatorio: 0,
});

/** Comercios distintos por semana, en total y por acción. */
export function serieSemanal(
  comercios: readonly ComercioHechos[],
  actividad: readonly ActividadSemanal[],
  semanas: readonly string[],
): Semana[] {
  return semanas.map((semana) => {
    const deLaSemana = actividad.filter((a) => a.semana === semana);
    const por_accion = ceroPorAccion();
    for (const accion of ACCIONES) {
      por_accion[accion] = new Set(
        deLaSemana.filter((a) => a.accion === accion).map((a) => a.user_id),
      ).size;
    }
    return {
      semana,
      altas: comercios.filter((c) => lunesDe(fechaAR(c.alta)) === semana).length,
      activos: new Set(deLaSemana.map((a) => a.user_id)).size,
      por_accion,
    };
  });
}

/**
 * Retención por semana de alta: de los que se dieron de alta la semana S,
 * cuántos hicieron algo en S, S+1, … hasta la semana actual.
 */
export function cohortes(
  comercios: readonly ComercioHechos[],
  actividad: readonly ActividadSemanal[],
  semanas: readonly string[],
): Cohorte[] {
  const activasPorUsuario = new Map<number, Set<string>>();
  for (const a of actividad) {
    const set = activasPorUsuario.get(a.user_id) ?? new Set<string>();
    set.add(a.semana);
    activasPorUsuario.set(a.user_id, set);
  }
  return semanas.map((semana, i) => {
    const cohorte = comercios.filter((c) => lunesDe(fechaAR(c.alta)) === semana);
    const retencion = semanas
      .slice(i)
      .map((s) => cohorte.filter((c) => activasPorUsuario.get(c.user_id)?.has(s)).length);
    return { semana, comercios: cohorte.length, retencion };
  });
}

/** Cuántos comercios llegaron a cada paso (cada paso es independiente del anterior). */
export function embudo(comercios: readonly ComercioHechos[]): PasoEmbudo[] {
  const contar = (f: (c: ComercioHechos) => boolean) => comercios.filter(f).length;
  return [
    { paso: 'Se registró', comercios: comercios.length },
    { paso: 'Puso el nombre del comercio', comercios: contar((c) => !!c.comercio?.trim()) },
    { paso: 'Cargó un cliente', comercios: contar((c) => c.primer_cliente !== null) },
    { paso: 'Anotó un fiado', comercios: contar((c) => c.primer_fiado !== null) },
    { paso: 'Registró un pago', comercios: contar((c) => c.primer_pago !== null) },
    { paso: 'Mandó un recordatorio', comercios: contar((c) => c.primer_recordatorio !== null) },
  ];
}

/** Uso de cada función entre los comercios que ya anotaron algún fiado. */
export function adopcion(comercios: readonly ComercioHechos[]): Adopcion[] {
  const base = comercios.filter((c) => c.fiados > 0);
  const contar = (f: (c: ComercioHechos) => boolean) => base.filter(f).length;
  const de = base.length;
  return [
    { funcion: 'Fecha de cobro en el fiado', comercios: contar((c) => c.fiados_con_vence > 0), de },
    { funcion: 'Registrar pagos', comercios: contar((c) => c.pagos > 0), de },
    { funcion: 'Recordatorios', comercios: contar((c) => c.recordatorios > 0), de },
    { funcion: 'Deshacer (corrección)', comercios: contar((c) => c.correcciones > 0), de },
    { funcion: 'Teléfono del cliente', comercios: contar((c) => c.clientes_con_telefono > 0), de },
    { funcion: 'Límite de fiado', comercios: contar((c) => c.clientes_con_limite > 0), de },
    { funcion: 'Etiqueta del cliente', comercios: contar((c) => c.clientes_con_etiqueta > 0), de },
    {
      funcion: 'Próximo cobro del cliente',
      comercios: contar((c) => c.clientes_con_proximo_cobro > 0),
      de,
    },
    { funcion: 'Alias para cobrar', comercios: contar((c) => c.alias), de },
    { funcion: 'Mensajes personalizados', comercios: contar((c) => c.plantillas_propias > 0), de },
  ];
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** Arma el reporte completo. `ingresos` = null si Clerk no respondió. */
export function armarReporte(
  comercios: readonly ComercioHechos[],
  actividad: readonly ActividadSemanal[],
  ingresos: ReadonlyMap<string, Ingreso> | null,
  semanas: number,
  ahora: Date,
): UsoReporte {
  const lunes = ultimasSemanas(fechaAR(ahora), semanas);
  const desde = (dias: number) => ahora.getTime() - dias * DIA_MS;
  const activosDesde = (dias: number) =>
    comercios.filter((c) => c.ultima_actividad && c.ultima_actividad.getTime() >= desde(dias))
      .length;
  const ingreso = (c: ComercioHechos) => ingresos?.get(c.clerk_user_id);

  return {
    generado_at: ahora.toISOString(),
    ingresos: ingresos ? 'clerk' : 'no_disponible',
    totales: {
      comercios: comercios.length,
      activos_7d: activosDesde(7),
      activos_30d: activosDesde(30),
      ingresaron_7d: ingresos
        ? comercios.filter((c) => (ingreso(c)?.last_active_at?.getTime() ?? 0) >= desde(7)).length
        : null,
    },
    embudo: embudo(comercios),
    adopcion: adopcion(comercios),
    semanal: serieSemanal(comercios, actividad, lunes),
    cohortes: cohortes(comercios, actividad, lunes),
    comercios: [...comercios]
      .sort((a, b) => (b.ultima_actividad?.getTime() ?? 0) - (a.ultima_actividad?.getTime() ?? 0))
      .map((c) => ({
        user_id: c.user_id,
        email: c.email,
        comercio: c.comercio?.trim() || null,
        alta: c.alta.toISOString(),
        clientes: c.clientes,
        fiados: c.fiados,
        pagos: c.pagos,
        recordatorios: c.recordatorios,
        ultima_actividad: iso(c.ultima_actividad),
        ultimo_ingreso: iso(ingreso(c)?.last_active_at ?? null),
        ultimo_login: iso(ingreso(c)?.last_sign_in_at ?? null),
      })),
  };
}
