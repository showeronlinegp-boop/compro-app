/** Formatos chicos del panel de uso (fechas cortas y porcentajes), en hora argentina. */

const TZ = 'America/Argentina/Buenos_Aires';
const DIA_MS = 86_400_000;

const ddmm = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', timeZone: TZ });
const ddmmaa = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  timeZone: TZ,
});
const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });

/** Lunes 'AAAA-MM-DD' → '26/10'. */
export function semanaCorta(lunes: string): string {
  const [, m, d] = lunes.split('-');
  return `${d}/${m}`;
}

/** Lunes 'AAAA-MM-DD' de la semana (argentina) de un ISO, como las semanas del backend. */
export function lunesAR(iso: string): string {
  const dia = ymd.format(new Date(iso));
  const dow = (new Date(`${dia}T00:00:00Z`).getUTCDay() + 6) % 7;
  return new Date(Date.parse(`${dia}T00:00:00Z`) - dow * DIA_MS).toISOString().slice(0, 10);
}

/** ISO → '26/10/26'. */
export function fechaCorta(iso: string): string {
  return ddmmaa.format(new Date(iso));
}

/** ISO → '26/10'. */
export function diaMes(iso: string): string {
  return ddmm.format(new Date(iso));
}

/** 'hoy', 'ayer', 'hace 5 días' o 'nunca', contando días calendario argentinos. */
export function haceCuanto(iso: string | null, ahora: Date = new Date()): string {
  if (!iso) return 'nunca';
  const dias = Math.round(
    (Date.parse(ymd.format(ahora)) - Date.parse(ymd.format(new Date(iso)))) / DIA_MS,
  );
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  return `hace ${dias} días`;
}

/** 3 de 4 → '75 %'; sobre 0 → '—'. */
export function porcentaje(n: number, de: number): string {
  return de > 0 ? `${Math.round((n / de) * 100)} %` : '—';
}
