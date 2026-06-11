import type { SuperKey } from './types/api';

export interface SuperConfig {
  label: string;
  bg: string;
  text: string;
  light: string;
}

export const SUPERS: Record<SuperKey, SuperConfig> = {
  vea: {
    label: 'VEA',
    bg: 'bg-red-600',
    text: 'text-white',
    light: 'bg-red-50 text-red-700 border-red-200',
  },
  carrefour: {
    label: 'CARREFOUR',
    bg: 'bg-blue-700',
    text: 'text-white',
    light: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  dia: {
    label: 'DIA',
    bg: 'bg-rose-600',
    text: 'text-white',
    light: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  masonline: {
    label: 'MAS',
    bg: 'bg-orange-500',
    text: 'text-white',
    light: 'bg-orange-50 text-orange-700 border-orange-200',
  },
};

export const SUPER_KEYS = Object.keys(SUPERS) as SuperKey[];

const FALLBACK_CFG: SuperConfig = {
  label: '?',
  bg: 'bg-gray-400',
  text: 'text-white',
  light: 'bg-gray-50 text-gray-700 border-gray-200',
};

export function superCfg(key: string): SuperConfig {
  return SUPERS[key as SuperKey] ?? { ...FALLBACK_CFG, label: key.toUpperCase() };
}

export const FREQ_OPTIONS: Array<{ days: number; label: string }> = [
  { days: 7, label: 'Semanal' },
  { days: 14, label: 'Quincenal' },
  { days: 30, label: 'Mensual' },
];

export function freqLabel(days: number): string {
  return FREQ_OPTIONS.find((f) => f.days === days)?.label ?? `Cada ${days} días`;
}

export function pesos(n: number | null | undefined): string {
  if (n == null) return '—';
  // Show cents only when the price has them (whole prices stay clean).
  const hasCents = !Number.isInteger(n);
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(n);
}
