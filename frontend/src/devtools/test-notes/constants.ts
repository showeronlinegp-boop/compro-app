import type { Estado, Modo, Tipo } from './types';

/**
 * Constantes de la herramienta. Las clases usan SOLO tokens del sistema de
 * diseño (docs/design-system.md); este archivo entra en host/ui/design-lint.
 */

export const TIPOS: readonly { id: Tipo; label: string }[] = [
  { id: 'error', label: 'Error' },
  { id: 'mejora', label: 'Mejora' },
  { id: 'duda', label: 'Duda' },
];

/** Estados en los que la nota sigue viva: tiene pin y cuenta en el botón "Notas". */
export const VIVAS: readonly Estado[] = ['abierta', 'en_curso', 'consulta', 'para_revisar'];

/** Todavía necesitan trabajo: se puede cambiar el modo y descartar. */
export const PENDIENTES: readonly Estado[] = ['abierta', 'en_curso', 'consulta'];

export type FiltroId = 'pendientes' | 'revisar' | 'corregidas' | 'descartadas';

/** Cada filtro agrupa estados. */
export const FILTROS: readonly { id: FiltroId; label: string; estados: readonly Estado[] }[] = [
  { id: 'pendientes', label: 'Pendientes', estados: PENDIENTES },
  { id: 'revisar', label: 'Para revisar', estados: ['para_revisar'] },
  { id: 'corregidas', label: 'Corregidas', estados: ['corregida'] },
  { id: 'descartadas', label: 'Descartadas', estados: ['descartada'] },
];

export const MODOS: readonly { id: Modo; label: string }[] = [
  { id: 'debatir', label: 'Debatir el tema conmigo' },
  { id: 'investigar', label: 'Investigar primero y contarme' },
  { id: 'consultas', label: 'Hacerme consultas para resolverlo' },
];

export const ESTADO_LABEL: Record<Estado, string> = {
  abierta: 'Abierta',
  en_curso: 'Claude la está trabajando',
  consulta: 'Claude te preguntó algo',
  para_revisar: 'Para revisar',
  corregida: 'Corregida',
  descartada: 'Descartada',
};

/** Etiqueta del tipo (fondo lleno). */
export const TIPO_CLASS: Record<Tipo, string> = {
  error: 'bg-danger text-surface',
  mejora: 'bg-ok text-surface',
  duda: 'bg-focus text-surface',
};

/** Borde izquierdo de la tarjeta según el tipo. */
export const TIPO_BORDER: Record<Tipo, string> = {
  error: 'border-l-danger',
  mejora: 'border-l-ok',
  duda: 'border-l-focus',
};

export const ESTADO_CLASS: Record<Estado, string> = {
  abierta: 'bg-warn-bg text-warn',
  en_curso: 'bg-surface-muted text-ink',
  consulta: 'bg-late-bg text-late',
  para_revisar: 'bg-ok-bg text-ok',
  corregida: 'bg-surface-muted text-ink-muted',
  descartada: 'bg-surface-muted text-ink-muted',
};

/** Recarga del listado (trae las respuestas de las correcciones). */
export const POLL_MS = 60_000;
