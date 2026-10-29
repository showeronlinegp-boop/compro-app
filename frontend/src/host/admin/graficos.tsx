import { type KeyboardEvent, type PointerEvent, useRef, useState } from 'react';
import { FOCUS_RING } from '../ui/styles';
import { semanaCorta } from './formato';

/**
 * Gráficos del panel de uso, sin librerías. Reglas (skill de dataviz + guía):
 * - Series con `--chart-1` / `--chart-2` en ese orden; el texto siempre en tinta.
 * - Barras finas (≤ 24 px) con la punta redondeada a 4 px y el valor en la punta.
 * - Líneas de 2 px, grilla en hairline sólida, un solo eje.
 * - Leyenda con 2+ series; cada gráfico tiene su tabla (o es una tabla).
 */

// ─── Barras horizontales ──────────────────────────────────────────────────────

export interface FilaBarra {
  id: string;
  etiqueta: string;
  valor: number;
  /** Texto en la punta de la barra ("3 de 5 · 60 %"). */
  texto: string;
}

/** Una sola serie: todas las barras en `--chart-1`, largo proporcional a `max`. */
export function Barras({
  filas,
  max,
  etiqueta,
}: {
  filas: readonly FilaBarra[];
  max: number;
  /** Nombre accesible de la lista. */
  etiqueta: string;
}) {
  return (
    <ul aria-label={etiqueta} className="m-0 p-0 list-none flex flex-col gap-3">
      {filas.map((f) => {
        const fraccion = max > 0 ? Math.min(f.valor / max, 1) : 0;
        return (
          <li key={f.id} className="flex flex-col gap-1">
            <span className="text-body-s text-ink">{f.etiqueta}</span>
            <div className="flex items-center gap-2">
              {fraccion > 0 && (
                <div
                  aria-hidden="true"
                  className="h-3 flex-none rounded-r-[4px] bg-chart-1"
                  style={{ width: `calc((100% - 7.5rem) * ${fraccion})` }}
                />
              )}
              <span className="text-caption font-bold text-ink tabular-nums whitespace-nowrap">
                {f.texto}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Líneas por semana ────────────────────────────────────────────────────────

export interface SerieSemanal {
  nombre: string;
  /** Clase de fondo de la serie (`bg-chart-1`) para leyenda, puntos y tooltip. */
  fondo: string;
  /** Color CSS de la línea (`var(--chart-1)`). */
  trazo: string;
  /** Un valor por semana; null = todavía no se medía. */
  valores: readonly (number | null)[];
}

const ALTO = 160;
/** Diferencia mínima (px) entre las etiquetas del final para no encimarlas. */
const SEPARACION_ETIQUETAS = 18;

/** Tope "lindo" del eje: múltiplo de 4 para tener 4 divisiones enteras. */
export function topeEje(max: number): number {
  if (max <= 4) return 4;
  const paso = Math.ceil(max / 4);
  const magnitud = 10 ** Math.floor(Math.log10(paso));
  const lindo = [1, 2, 2.5, 5, 10].map((m) => m * magnitud).find((p) => p >= paso) ?? paso;
  return Math.ceil(lindo) * 4;
}

/**
 * Comercios por semana. Cruz que sigue al dedo o al mouse (salta a la semana
 * más cercana) con un tooltip que lista todas las series; con teclado, ← y →.
 */
export function LineasSemanales({
  semanas,
  series,
}: {
  semanas: readonly string[];
  series: readonly SerieSemanal[];
}) {
  const [activa, setActiva] = useState<number | null>(null);
  const plot = useRef<HTMLDivElement>(null);
  const n = semanas.length;
  const max = Math.max(0, ...series.flatMap((s) => s.valores.map((v) => v ?? 0)));
  const tope = topeEje(max);
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100); // % del ancho
  const y = (v: number) => ALTO - (v / tope) * ALTO; // px desde arriba

  const semanaEn = (clientX: number) => {
    const rect = plot.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return n - 1;
    const f = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(n - 1, Math.round(f * (n - 1))));
  };
  const alMover = (e: PointerEvent) => setActiva(semanaEn(e.clientX));
  const alTeclear = (e: KeyboardEvent) => {
    // Sin semana activa, el slider está en la última (como anuncia aria-valuenow).
    if (e.key === 'ArrowLeft') setActiva((i) => Math.max(0, (i ?? n - 1) - 1));
    else if (e.key === 'ArrowRight') setActiva((i) => Math.min(n - 1, (i ?? n - 1) + 1));
    else if (e.key === 'Escape') setActiva(null);
    else return;
    e.preventDefault();
  };

  const textoSemana = (i: number) =>
    `Semana del ${semanaCorta(semanas[i] ?? '')}: ${series
      .map((s) => `${s.valores[i] ?? 'sin dato'} ${s.nombre.toLowerCase()}`)
      .join(', ')}`;

  // Etiquetas al final de cada línea, salvo que se encimen (ahí alcanzan leyenda y tooltip).
  const finales = series.map((s) => s.valores[n - 1] ?? null);
  const ysFinales = finales.map((v) => (v === null ? null : y(v)));
  const [y0, y1] = ysFinales;
  const etiquetarFinal =
    ysFinales.length < 2 || y0 == null || y1 == null || Math.abs(y0 - y1) >= SEPARACION_ETIQUETAS;

  const xLabels = n <= 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];

  return (
    <figure className="m-0 flex flex-col gap-3">
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s) => (
          <span key={s.nombre} className="inline-flex items-center gap-2 text-caption text-ink">
            <span
              aria-hidden="true"
              className={`inline-block h-[2px] w-4 rounded-pill ${s.fondo}`}
            />
            {s.nombre}
          </span>
        ))}
      </figcaption>

      <div className="flex gap-2">
        {/* Eje Y: 0, mitad y tope (texto HTML para que nunca baje de 12 px). */}
        <div
          aria-hidden="true"
          className="relative w-7 flex-none text-micro text-ink-muted tabular-nums"
          style={{ height: ALTO }}
        >
          {[tope, tope / 2, 0].map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: y(t) }}>
              {t}
            </span>
          ))}
        </div>

        <div className="relative flex-1 min-w-0 mr-8">
          {/* Slider: con ← y → se recorren las semanas y el lector lee sus valores. */}
          <div
            ref={plot}
            role="slider"
            aria-label={`Semana a ver en el gráfico de ${series.map((s) => s.nombre).join(' y ')}`}
            aria-valuemin={0}
            aria-valuemax={Math.max(0, n - 1)}
            aria-valuenow={activa ?? n - 1}
            aria-valuetext={textoSemana(activa ?? n - 1)}
            tabIndex={0}
            onPointerMove={alMover}
            onPointerDown={alMover}
            onPointerLeave={(e) => e.pointerType === 'mouse' && setActiva(null)}
            onKeyDown={alTeclear}
            onBlur={() => setActiva(null)}
            className={`relative touch-pan-y rounded-[4px] ${FOCUS_RING}`}
            style={{ height: ALTO }}
          >
            <svg
              aria-hidden="true"
              width="100%"
              height={ALTO}
              viewBox={`0 0 100 ${ALTO}`}
              preserveAspectRatio="none"
              className="block overflow-visible"
            >
              {[tope, tope / 2, 0].map((t) => (
                <line
                  key={t}
                  x1={0}
                  x2={100}
                  y1={y(t)}
                  y2={y(t)}
                  stroke={t === 0 ? 'var(--border)' : 'var(--line)'}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {series.map((s) => (
                <polyline
                  key={s.nombre}
                  fill="none"
                  stroke={s.trazo}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  points={s.valores
                    .map((v, i) => (v === null ? null : `${x(i)},${y(v)}`))
                    .filter(Boolean)
                    .join(' ')}
                />
              ))}
            </svg>

            {/* Puntos del final (y de la semana activa), en HTML para que no se deformen. */}
            {series.map((s) =>
              [...new Set([n - 1, activa ?? n - 1])].map((i) => {
                const v = s.valores[i];
                if (v == null) return null;
                return (
                  <span
                    key={`${s.nombre}-${i}`}
                    aria-hidden="true"
                    className={`absolute h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-pill ring-2 ring-surface ${s.fondo}`}
                    style={{ left: `${x(i)}%`, top: y(v) }}
                  />
                );
              }),
            )}

            {etiquetarFinal &&
              series.map((s, k) => {
                const v = finales[k];
                if (v == null) return null;
                return (
                  <span
                    key={s.nombre}
                    aria-hidden="true"
                    className="absolute left-full ml-2 -translate-y-1/2 text-caption font-bold text-ink tabular-nums"
                    style={{ top: y(v) }}
                  >
                    {v}
                  </span>
                );
              })}

            {activa !== null && (
              <>
                <span
                  aria-hidden="true"
                  className="absolute top-0 w-px bg-border"
                  style={{ left: `${x(activa)}%`, height: ALTO }}
                />
                <output
                  className="absolute top-0 z-10 min-w-[9.5rem] rounded-m bg-surface border border-line p-3 pointer-events-none"
                  style={
                    x(activa) > 50
                      ? { right: `calc(${100 - x(activa)}% + 8px)` }
                      : { left: `calc(${x(activa)}% + 8px)` }
                  }
                >
                  <span className="block text-caption text-ink-muted">
                    Semana del {semanaCorta(semanas[activa] ?? '')}
                  </span>
                  {series.map((s) => (
                    <span
                      key={s.nombre}
                      className="flex items-center gap-2 text-caption text-ink-muted"
                    >
                      <span aria-hidden="true" className={`h-[2px] w-3 rounded-pill ${s.fondo}`} />
                      <strong className="text-body-s text-ink tabular-nums">
                        {s.valores[activa] ?? '—'}
                      </strong>
                      {s.nombre}
                    </span>
                  ))}
                </output>
              </>
            )}
          </div>

          {/* Eje X: primera, del medio y última semana. */}
          <div aria-hidden="true" className="relative mt-1 h-5 text-micro text-ink-muted">
            {xLabels.map((i) => (
              <span
                key={i}
                className={`absolute whitespace-nowrap ${
                  i === 0 ? '' : i === n - 1 ? '-translate-x-full' : '-translate-x-1/2'
                }`}
                style={{ left: `${x(i)}%` }}
              >
                {semanaCorta(semanas[i] ?? '')}
              </span>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}

// ─── Retención por semana de alta ─────────────────────────────────────────────

export interface FilaCohorte {
  semana: string;
  comercios: number;
  retencion: readonly number[];
}

/**
 * Tabla de retención con celdas en un solo tono (más oscuro = más volvieron).
 * El relleno llega como máximo al 70 % de `--chart-1` para que el texto en
 * tinta siempre se lea (contraste ≥ 4,5:1).
 */
export function MapaCohortes({
  filas,
  columnas,
}: { filas: readonly FilaCohorte[]; columnas: number }) {
  const cols = Array.from({ length: columnas }, (_, k) => k);
  return (
    <table className="w-full table-fixed border-separate border-spacing-[2px] text-micro text-ink">
      <caption className="sr-only">
        Porcentaje de comercios de cada semana de alta que anotaron algo en las semanas siguientes
      </caption>
      <thead>
        <tr className="text-ink-muted">
          <th scope="col" className="w-[2.75rem] text-left font-bold">
            Alta
          </th>
          <th scope="col" className="w-5 text-right font-bold">
            <abbr title="Comercios" className="no-underline">
              N
            </abbr>
          </th>
          {cols.map((k) => (
            <th key={k} scope="col" className="font-bold text-center">
              <abbr
                title={k === 0 ? 'Semana del alta' : `${k} semanas después`}
                className="no-underline"
              >
                S{k}
              </abbr>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.semana}>
            <th scope="row" className="text-left font-normal tabular-nums">
              {semanaCorta(f.semana)}
            </th>
            <td className="text-right tabular-nums pr-[2px]">{f.comercios}</td>
            {cols.map((k) => {
              const v = f.retencion[k];
              if (v === undefined) return <td key={k} />;
              const pct = Math.round((v / f.comercios) * 100);
              return (
                <td
                  key={k}
                  title={`${v} de ${f.comercios}`}
                  className="h-7 rounded-[4px] p-0 text-center text-[12px] tabular-nums"
                  style={{
                    background: `color-mix(in srgb, var(--chart-1) ${10 + Math.round(pct * 0.6)}%, var(--surface))`,
                  }}
                >
                  {pct}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
