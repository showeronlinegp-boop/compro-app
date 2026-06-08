export const SUPERS = {
  vea:       { label: 'VEA',       bg: 'bg-red-600',    text: 'text-white', light: 'bg-red-50 text-red-700 border-red-200' },
  carrefour: { label: 'CARREFOUR', bg: 'bg-blue-700',   text: 'text-white', light: 'bg-blue-50 text-blue-700 border-blue-200' },
  dia:       { label: 'DIA',       bg: 'bg-rose-600',   text: 'text-white', light: 'bg-rose-50 text-rose-700 border-rose-200' },
  masonline: { label: 'MAS',       bg: 'bg-orange-500', text: 'text-white', light: 'bg-orange-50 text-orange-700 border-orange-200' },
};

export const SUPER_KEYS = Object.keys(SUPERS);

export function superCfg(key) {
  return SUPERS[key] || { label: key?.toUpperCase() || '?', bg: 'bg-gray-400', text: 'text-white', light: 'bg-gray-50 text-gray-700 border-gray-200' };
}

export const FREQ_OPTIONS = [
  { days: 7,  label: 'Semanal'    },
  { days: 14, label: 'Quincenal'  },
  { days: 30, label: 'Mensual'    },
];

export function freqLabel(days) {
  return FREQ_OPTIONS.find(f => f.days === days)?.label ?? `Cada ${days} días`;
}

export function pesos(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
}
