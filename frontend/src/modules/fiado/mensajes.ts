import { formatMoney } from '../../host/ui/format';
import type { Ajustes, Cliente } from './api';
import { primerNombre, textoDia, textoSaldo } from './textos';

export const FIRMA = 'Hecho con Neggo';

/**
 * Reemplaza `{variable}` por su valor (las desconocidas quedan como están) y
 * asegura la firma al final, aunque la plantilla la haya borrado (guía §4.9).
 * Misma regla que `renderPlantilla` del backend.
 */
export function renderPlantilla(plantilla: string, vars: Record<string, string>): string {
  const texto = plantilla
    .replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match)
    .trimEnd();
  return texto.endsWith(FIRMA) ? texto : `${texto}\n\n${FIRMA}`;
}

function varsBase(cliente: Cliente, ajustes: Ajustes): Record<string, string> {
  return {
    nombre: primerNombre(cliente.nombre),
    saldo: textoSaldo(cliente.saldo),
    comercio: ajustes.comercio || 'mi comercio',
    alias: ajustes.alias || '(pedime el alias)',
  };
}

/** Lo que dice `{vence}` en un fiado sin fecha de cobro (nota de prueba #6). */
export const SIN_FECHA_COBRO = 'a convenir';

/**
 * Comprobante después de anotar un fiado o un pago. `monto` sin signo;
 * `vence` es la fecha de cobro del fiado ('AAAA-MM-DD') o null.
 */
export function comprobante(
  tipo: 'fiado' | 'pago',
  monto: number,
  cliente: Cliente,
  ajustes: Ajustes,
  vence: string | null = null,
): string {
  const plantilla = tipo === 'fiado' ? ajustes.plantilla_fiado : ajustes.plantilla_pago;
  const texto = renderPlantilla(plantilla, {
    ...varsBase(cliente, ajustes),
    monto: formatMoney(monto),
    vence: vence ? textoDia(vence) : SIN_FECHA_COBRO,
  });
  return tipo === 'fiado' ? antesDeLaFirma(texto, lineaCondiciones(cliente, ajustes)) : texto;
}

/** Recordatorio de pago para un cliente que debe. */
export function recordatorio(cliente: Cliente, ajustes: Ajustes): string {
  const texto = renderPlantilla(ajustes.plantilla_recordatorio, varsBase(cliente, ajustes));
  const recargos =
    cliente.recargos_pendientes > 0
      ? `Del saldo, ${formatMoney(cliente.recargos_pendientes)} son recargos por atraso.`
      : null;
  return antesDeLaFirma(texto, recargos);
}

// ─── Recargos por atraso ──────────────────────────────────────────────────────

/**
 * Línea FIJA con las condiciones de recargo, que va en cada comprobante de
 * fiado mientras estén activos (el comercio no la puede editar ni borrar).
 */
export function lineaCondiciones(cliente: Cliente, ajustes: Ajustes): string | null {
  if (!ajustes.recargo_condiciones || cliente.sin_recargo) return null;
  return `Si se atrasa, se cobra ${ajustes.recargo_condiciones}.`;
}

/** Suma una línea fija justo antes de la firma (si la hay). */
function antesDeLaFirma(texto: string, linea: string | null): string {
  if (!linea) return texto;
  const cuerpo = texto.endsWith(FIRMA) ? texto.slice(0, -FIRMA.length).trimEnd() : texto;
  return `${cuerpo}\n\n${linea}\n\n${FIRMA}`;
}

/** Lo mínimo de un recargo para armar el comprobante. */
export interface RecargoComprobante {
  monto: number;
  /** "5 % de $ 12.000 · mes 1". */
  detalle: string;
  /** 'AAAA-MM-DD' en que se anotó el fiado. */
  fiado_fecha: string;
}

/** Comprobante FIJO después de sumar recargos: cada uno con su fiado y la cuenta. */
export function comprobanteRecargos(
  recargos: readonly RecargoComprobante[],
  cliente: Cliente,
  ajustes: Ajustes,
): string {
  const { nombre, comercio, saldo } = varsBase(cliente, ajustes);
  const que = recargos.length === 1 ? 'un recargo' : 'recargos';
  const lineas = recargos.map(
    (r) => `• ${formatMoney(r.monto)} por el fiado del ${textoDia(r.fiado_fecha)} (${r.detalle})`,
  );
  return `Hola ${nombre}, sumé ${que} por atraso en tu cuenta de ${comercio}:\n${lineas.join('\n')}\nTu saldo es ${saldo}.\n\n${FIRMA}`;
}

/**
 * Link de WhatsApp con el mensaje cargado. Sin número válido abre WhatsApp
 * para elegir el contacto a mano.
 */
export function linkWhatsApp(numero: string | null, texto: string): string {
  const q = `text=${encodeURIComponent(texto)}`;
  return numero ? `https://wa.me/${numero}?${q}` : `https://wa.me/?${q}`;
}

/** Abre WhatsApp en otra pestaña o en la app. */
export function abrirWhatsApp(numero: string | null, texto: string): void {
  window.open(linkWhatsApp(numero, texto), '_blank', 'noopener,noreferrer');
}

export type Variable = 'nombre' | 'monto' | 'saldo' | 'comercio' | 'alias' | 'vence';

/** Variables que acepta cada plantilla (pastillas en Ajustes). */
export const VARIABLES: Record<'fiado' | 'pago' | 'recordatorio', readonly Variable[]> = {
  fiado: ['nombre', 'monto', 'saldo', 'comercio', 'vence'],
  pago: ['nombre', 'monto', 'saldo', 'comercio'],
  recordatorio: ['nombre', 'saldo', 'comercio', 'alias'],
};

/** Cómo se muestra cada variable en las pastillas. */
export const ETIQUETA_VARIABLE: Record<Variable, string> = {
  nombre: 'Nombre',
  monto: 'Monto',
  saldo: 'Saldo',
  comercio: 'Comercio',
  alias: 'Alias',
  vence: 'Fecha de cobro',
};

/**
 * Inserta `{variable}` en la selección `[inicio, fin)` del texto, separándola
 * con espacios de las palabras pegadas. Devuelve el texto y dónde queda el cursor.
 */
export function insertarVariable(
  texto: string,
  variable: Variable,
  inicio: number,
  fin: number,
): { texto: string; cursor: number } {
  const antes = texto.slice(0, inicio);
  const despues = texto.slice(fin);
  const izq = antes === '' || /\s$/.test(antes) ? '' : ' ';
  const der = despues === '' || /^[\s.,;:!?)]/.test(despues) ? '' : ' ';
  const token = `${izq}{${variable}}${der}`;
  return { texto: antes + token + despues, cursor: antes.length + token.length };
}
