import { req } from '../../host/http';

// ─── Tipos (espejo de las vistas de backend/src/modules/fiado) ────────────────

export type TipoMovimiento = 'fiado' | 'pago' | 'correccion' | 'recargo';
export type OrdenClientes = 'deuda' | 'dias' | 'az';

export interface Cliente {
  id: number;
  nombre: string;
  telefono: string | null;
  /** `549…` listo para wa.me, o null. */
  whatsapp: string | null;
  etiqueta: string | null;
  limite: number | null;
  /** 'AAAA-MM-DD' o null. */
  proximo_cobro: string | null;
  /** Lo que te debe; negativo = saldo a favor. */
  saldo: number;
  dias_sin_pagar: number | null;
  excede_limite: boolean;
  /** Lo que ya tendría que haber pagado (vence hoy o antes). */
  vencido: number;
  /** 'AAAA-MM-DD' del vencimiento vencido más viejo, o null. */
  vencido_desde: string | null;
  /** El próximo vencimiento que todavía no llegó. */
  proximo_vencimiento: { fecha: string; monto: number } | null;
  /** No sugerirle recargos a este cliente. */
  sin_recargo: boolean;
  /** Parte del saldo que son recargos sin pagar. */
  recargos_pendientes: number;
  /** Total de recargos sugeridos para sumar hoy (0 = nada que decidir). */
  recargo_para_sumar: number;
  /** Hay que avisarle las condiciones antes de anotarle fiados o recargos. */
  aviso_recargo_pendiente: boolean;
}

export interface Movimiento {
  id: number;
  cliente_id: number;
  cliente_nombre: string;
  tipo: TipoMovimiento;
  /** Efecto con signo sobre lo que te deben: fiado > 0, pago < 0. */
  monto: number;
  nota: string | null;
  created_at: string;
  corrige_id: number | null;
  corregido_por: number | null;
  /** En un fiado vigente (sólo en la ficha): cuándo vence. */
  vence: string | null;
  /** En un fiado o recargo vigente (sólo en la ficha): lo que falta pagar. */
  pendiente: number | null;
  /** En un recargo: el fiado al que pertenece. */
  recargo_de: number | null;
  /** En un recargo: último período de atraso que cubre. */
  recargo_periodo: number | null;
}

export interface Cobro extends Cliente {
  recordado_hoy: boolean;
}

export interface Resumen {
  total: number;
  clientes_con_deuda: number;
  para_cobrar: Cobro[];
  ultimos: Movimiento[];
}

/** Un cliente en la campanita: cuánto y desde/para cuándo ('AAAA-MM-DD'). */
export interface Aviso {
  cliente_id: number;
  cliente_nombre: string;
  monto: number;
  fecha: string;
  recordado_hoy: boolean;
}

export interface Avisos {
  vencidos: Aviso[];
  hoy: Aviso[];
  proximos: Aviso[];
  /** Número de la campanita: vencidos u hoy sin recordar todavía. */
  sin_recordar: number;
}

/** Un recargo que corresponde sumar hoy (uno por fiado). */
export interface RecargoSugerido {
  fiado_id: number;
  /** 'AAAA-MM-DD' en que se anotó el fiado. */
  fiado_fecha: string;
  vence: string;
  base: number;
  dias_atraso: number;
  periodo_desde: number;
  periodo_hasta: number;
  monto: number;
  /** "5 % de $ 12.000 · mes 1". */
  detalle: string;
}

export interface RecargoFicha {
  /** Aviso de condiciones pendiente: el texto fijo para mandarle. */
  aviso: { texto: string } | null;
  sugeridos: RecargoSugerido[];
  total: number;
}

export interface Ficha {
  cliente: Cliente;
  historial: Movimiento[];
  /** null = recargos apagados o cliente "sin recargo". */
  recargo: RecargoFicha | null;
}

export interface MovimientoResult {
  movimiento: Movimiento;
  cliente: Cliente;
}

export interface RecargosResult {
  movimientos: Movimiento[];
  cliente: Cliente;
}

export type EsquemaRecargo = 'mes' | 'semana' | 'tramos';

export interface TramoRecargo {
  /** Último día de atraso del tramo; null = "más de …" (sólo el último). */
  hasta: number | null;
  /** Porcentaje TOTAL del tramo. */
  pct: number;
}

/** Configuración del recargo por atraso (espejo de ConfigRecargo del backend). */
export interface ConfigRecargo {
  esquema: EsquemaRecargo;
  tipo?: 'pct' | 'fijo';
  valor?: number;
  tramos?: TramoRecargo[];
  tolerancia: number;
  desde: 'vencimiento' | 'activacion';
  activado_el?: string;
}

export interface Ajustes {
  comercio: string;
  alias: string | null;
  dias_deuda_vieja: number;
  plantilla_fiado: string;
  plantilla_pago: string;
  plantilla_recordatorio: string;
  /** null = recargos apagados. */
  recargo: ConfigRecargo | null;
  /** Las condiciones en una frase (la misma que va en el aviso y los comprobantes). */
  recargo_condiciones: string | null;
  recargo_version: number;
}

export interface ClienteInput {
  nombre: string;
  telefono?: string | null;
  etiqueta?: string | null;
  limite?: number | null;
  /** Sólo al editar: no sugerirle recargos. */
  sin_recargo?: boolean;
}

export interface MovimientoInput {
  cliente_id: number;
  tipo: 'fiado' | 'pago';
  monto: number;
  nota?: string | null;
  /** Sólo en un fiado: 'AAAA-MM-DD' en que te lo tienen que pagar. */
  vence?: string | null;
  idempotency_key: string;
}

// ─── Cliente HTTP ─────────────────────────────────────────────────────────────

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

export const fiadoApi = {
  resumen: () => req<Resumen>('/fiado/resumen'),
  avisos: () => req<Avisos>('/fiado/avisos'),
  clientes: (q = '', orden: OrdenClientes = 'deuda') =>
    req<Cliente[]>(`/fiado/clientes?${new URLSearchParams({ q, orden })}`),
  crearCliente: (input: ClienteInput) => req<Cliente>('/fiado/clientes', json('POST', input)),
  ficha: (id: number) => req<Ficha>(`/fiado/clientes/${id}`),
  actualizarCliente: (id: number, patch: Partial<ClienteInput>) =>
    req<Cliente>(`/fiado/clientes/${id}`, json('PATCH', patch)),
  crearMovimiento: (input: MovimientoInput) =>
    req<MovimientoResult>('/fiado/movimientos', json('POST', input)),
  corregir: (movimientoId: number) =>
    req<MovimientoResult>(`/fiado/movimientos/${movimientoId}/correccion`, { method: 'POST' }),
  /** "Perdonar" un recargo: lo deshace y deja ese período como "No cobrar". */
  perdonarRecargo: (movimientoId: number) =>
    req<MovimientoResult>(`/fiado/movimientos/${movimientoId}/perdonar`, { method: 'POST' }),
  recordar: (clienteId: number) =>
    req<{ cliente_id: number; enviado_at: string }>(`/fiado/clientes/${clienteId}/recordatorios`, {
      method: 'POST',
    }),
  ajustes: () => req<Ajustes>('/fiado/ajustes'),
  guardarAjustes: (patch: Partial<Omit<Ajustes, 'recargo'>> & { recargo?: ConfigRecargo | null }) =>
    req<Ajustes>('/fiado/ajustes', json('PUT', patch)),
  /** "Sumar recargos": todos los sugeridos o los de `fiadoIds`. */
  sumarRecargos: (clienteId: number, idempotencyKey: string, fiadoIds?: number[]) =>
    req<RecargosResult>(
      `/fiado/clientes/${clienteId}/recargos`,
      json('POST', {
        idempotency_key: idempotencyKey,
        ...(fiadoIds ? { fiado_ids: fiadoIds } : {}),
      }),
    ),
  /** "No cobrar" el período sugerido de un fiado. Devuelve la ficha actualizada. */
  omitirRecargo: (clienteId: number, fiadoId: number) =>
    req<Ficha>(`/fiado/clientes/${clienteId}/recargos/omitir`, json('POST', { fiado_id: fiadoId })),
  /** El comercio le avisó las condiciones (por WhatsApp o "Cambio informado"). */
  avisarRecargo: (clienteId: number, via: 'whatsapp' | 'informado') =>
    req<{ cliente_id: number; version: number; via: string }>(
      `/fiado/clientes/${clienteId}/aviso-recargo`,
      json('POST', { via }),
    ),
};

/**
 * Mensaje legible de un error de `req` ("400 {"error":"…"}"). Si no viene del
 * backend, un texto genérico en voseo.
 */
export function mensajeDeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : '';
  const match = raw.match(/^\d{3} (.*)$/s);
  if (match?.[1]) {
    try {
      const body = JSON.parse(match[1]) as { error?: unknown };
      if (typeof body.error === 'string' && body.error) return body.error;
    } catch {
      // cuerpo no-JSON: cae al genérico
    }
  }
  return 'No pudimos conectarnos. Revisá la conexión y probá de nuevo.';
}
