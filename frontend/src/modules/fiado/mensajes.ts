import { formatMoney } from '../../host/ui/format';
import type { Ajustes, Cliente } from './api';
import { primerNombre, textoSaldo } from './textos';

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

/** Comprobante después de anotar un fiado o un pago. `monto` sin signo. */
export function comprobante(
  tipo: 'fiado' | 'pago',
  monto: number,
  cliente: Cliente,
  ajustes: Ajustes,
): string {
  const plantilla = tipo === 'fiado' ? ajustes.plantilla_fiado : ajustes.plantilla_pago;
  return renderPlantilla(plantilla, { ...varsBase(cliente, ajustes), monto: formatMoney(monto) });
}

/** Recordatorio de pago para un cliente que debe. */
export function recordatorio(cliente: Cliente, ajustes: Ajustes): string {
  return renderPlantilla(ajustes.plantilla_recordatorio, varsBase(cliente, ajustes));
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

/** Variables que acepta cada plantilla (ayuda en Ajustes). */
export const VARIABLES = {
  fiado: '{nombre}, {monto}, {saldo}, {comercio}',
  pago: '{nombre}, {monto}, {saldo}, {comercio}',
  recordatorio: '{nombre}, {saldo}, {comercio}, {alias}',
} as const;
