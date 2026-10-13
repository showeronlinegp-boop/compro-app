import { formatMoney } from '../../host/ui/format';
import type { Cliente, Movimiento } from './api';

/** Umbral de "deuda vieja" para pintar los días en `--late` (guía §4.3). */
export const DIAS_TARDE = 30;

/** "18 días sin pagar", "Hoy", o null si no debe nada. */
export function textoDias(dias: number | null): string | null {
  if (dias == null) return null;
  if (dias === 0) return 'Anotado hoy';
  return dias === 1 ? '1 día sin pagar' : `${dias} días sin pagar`;
}

/** Saldo para mostrar: "$ 42.300" o "$ 500 a favor". */
export function textoSaldo(saldo: number): string {
  return saldo < 0 ? `${formatMoney(saldo)} a favor` : formatMoney(saldo);
}

/** "Fiado", "Pagó", "Corrección" — sin jerga contable (guía §5). */
export function textoTipo(m: Pick<Movimiento, 'tipo'>): string {
  if (m.tipo === 'fiado') return 'Fiado';
  if (m.tipo === 'pago') return 'Pagó';
  return 'Corrección';
}

const fechaCorta = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Argentina/Buenos_Aires',
});

/** "13 oct, 14:05". */
export function textoFecha(iso: string): string {
  return fechaCorta.format(new Date(iso));
}

const fechaDia = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** 'AAAA-MM-DD' → "1 nov". */
export function textoDia(ymd: string | null): string {
  return ymd ? fechaDia.format(new Date(`${ymd}T00:00:00Z`)) : '—';
}

/** "Buen día" / "Buenas tardes" / "Buenas noches" según la hora local. */
export function saludo(ahora = new Date()): string {
  const h = ahora.getHours();
  if (h >= 6 && h < 13) return 'Buen día';
  if (h >= 13 && h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Línea secundaria de un cliente en listas. */
export function lineaCliente(c: Pick<Cliente, 'dias_sin_pagar' | 'saldo'>): string {
  if (c.saldo < 0) return 'Tiene saldo a favor';
  if (c.saldo === 0) return 'Al día';
  return textoDias(c.dias_sin_pagar) ?? '';
}

/** Sólo el primer nombre: "Marta Giménez" → "Marta". */
export function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? nombre;
}
