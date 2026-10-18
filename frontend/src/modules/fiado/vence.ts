/**
 * Fecha de cobro de un fiado (nota de prueba #3): atajos de "Anotar fiado".
 * Las fechas son 'AAAA-MM-DD' en hora argentina, como las del backend.
 */

export type Atajo = 'sin' | '7' | '15' | '30' | 'dia10';

const ymdAR = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Hoy en Argentina: '2026-10-18'. */
export function hoyAR(ahora = new Date()): string {
  return ymdAR.format(ahora);
}

/** 'AAAA-MM-DD' + n días. */
export function sumarDias(ymd: string, n: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** El 10 del mes que viene, siempre (decisión 2026-10-18): 18/10 → 10/11, 3/10 → 10/11. */
export function diez(ymd: string): string {
  const [y = 0, m = 1] = ymd.split('-').map(Number);
  const siguiente = new Date(Date.UTC(y, m, 10));
  return siguiente.toISOString().slice(0, 10);
}

/** Fecha que corresponde a un atajo, o null si es "Sin fecha". */
export function fechaDeAtajo(atajo: Atajo, hoy: string): string | null {
  if (atajo === 'sin') return null;
  if (atajo === 'dia10') return diez(hoy);
  return sumarDias(hoy, Number(atajo));
}

const mesCorto = new Intl.DateTimeFormat('es-AR', { month: 'short', timeZone: 'UTC' });

/** Opciones de las pastillas; el 10 lleva el mes: "El 10 de nov". */
export function opcionesAtajo(hoy: string): { value: Atajo; label: string }[] {
  const mes = mesCorto.format(new Date(`${diez(hoy)}T00:00:00Z`)).replace('.', '');
  return [
    { value: 'sin', label: 'Sin fecha' },
    { value: '7', label: '7 días' },
    { value: '15', label: '15 días' },
    { value: '30', label: '30 días' },
    { value: 'dia10', label: `El 10 de ${mes}` },
  ];
}

/** Días calendario de `hoy` a `ymd` (negativo si ya pasó). */
export function diasHasta(ymd: string, hoy: string): number {
  return Math.round((Date.parse(`${ymd}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000);
}
