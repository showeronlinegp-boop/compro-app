import { req } from '../../host/http';

// ─── Tipos (espejo de las vistas de backend/src/modules/fiado) ────────────────

export type TipoMovimiento = 'fiado' | 'pago' | 'correccion';
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

export interface Ficha {
  cliente: Cliente;
  historial: Movimiento[];
}

export interface MovimientoResult {
  movimiento: Movimiento;
  cliente: Cliente;
}

export interface Ajustes {
  comercio: string;
  alias: string | null;
  dias_deuda_vieja: number;
  plantilla_fiado: string;
  plantilla_pago: string;
  plantilla_recordatorio: string;
}

export interface ClienteInput {
  nombre: string;
  telefono?: string | null;
  etiqueta?: string | null;
  limite?: number | null;
  proximo_cobro?: string | null;
}

export interface MovimientoInput {
  cliente_id: number;
  tipo: 'fiado' | 'pago';
  monto: number;
  nota?: string | null;
  idempotency_key: string;
}

// ─── Cliente HTTP ─────────────────────────────────────────────────────────────

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

export const fiadoApi = {
  resumen: () => req<Resumen>('/fiado/resumen'),
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
  recordar: (clienteId: number) =>
    req<{ cliente_id: number; enviado_at: string }>(`/fiado/clientes/${clienteId}/recordatorios`, {
      method: 'POST',
    }),
  ajustes: () => req<Ajustes>('/fiado/ajustes'),
  guardarAjustes: (patch: Partial<Ajustes>) => req<Ajustes>('/fiado/ajustes', json('PUT', patch)),
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
