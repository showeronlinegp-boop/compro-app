import type { Ajustes, Cliente } from './api';
import { PLANTILLAS_ORIGINALES } from './mensajes';

/**
 * Datos de ejemplo de la página pública y del modo prueba (plan de adopción,
 * fase 2). Viven sólo en el navegador: nunca se mandan al backend.
 */

/** Kiosco de ejemplo, con los mensajes originales. */
export const AJUSTES_PRUEBA: Ajustes = {
  comercio: 'Kiosco Lu',
  alias: 'kiosco.lu',
  dias_deuda_vieja: 30,
  ...PLANTILLAS_ORIGINALES,
  recargo: null,
  recargo_condiciones: null,
  recargo_version: 0,
  recargo_terminos_version: '',
  recargo_terminos_aceptados: false,
};

/** Un cliente completo a partir de lo mínimo; el resto, sin recargos ni vencimientos. */
export function clienteDePrueba(
  id: number,
  nombre: string,
  saldo: number,
  dias_sin_pagar: number | null,
): Cliente {
  return {
    id,
    nombre,
    telefono: null,
    whatsapp: null,
    etiqueta: null,
    limite: null,
    proximo_cobro: null,
    saldo,
    dias_sin_pagar: saldo > 0 ? dias_sin_pagar : null,
    excede_limite: false,
    vencido: 0,
    vencido_desde: null,
    proximo_vencimiento: null,
    sin_recargo: false,
    recargos_pendientes: 0,
    recargo_para_sumar: 0,
    aviso_recargo_pendiente: false,
  };
}

/** Con qué arranca el modo prueba. */
export function clientesIniciales(): Cliente[] {
  return [
    clienteDePrueba(1, 'Marta Giménez', 12300, 18),
    clienteDePrueba(2, 'Don Carlos', 4500, 6),
    clienteDePrueba(3, 'Rosa Pérez', 2800, 2),
  ];
}

/** Aplica un fiado o un pago a un cliente de prueba. */
export function conMovimiento(c: Cliente, tipo: 'fiado' | 'pago', monto: number): Cliente {
  const saldo = c.saldo + (tipo === 'fiado' ? monto : -monto);
  let dias = c.dias_sin_pagar;
  if (saldo <= 0) dias = null;
  else if (tipo === 'fiado' && c.saldo <= 0) dias = 0;
  return { ...c, saldo, dias_sin_pagar: dias };
}
