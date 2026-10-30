import { useEffect, useState } from 'react';
import type { AppModule } from '../contract';
import { Button } from '../ui/Button';
import { ScreenHeader } from '../ui/ScreenHeader';
import { FilterChips } from '../ui/controls';
import { Card, DataCells, EmptyNote, List, ListRow, Notice, Section } from '../ui/surfaces';
import { type UsoReporte, adminApi } from './api';
import { fechaCorta, haceCuanto, lunesAR, porcentaje, semanaCorta } from './formato';
import { Barras, LineasSemanales, MapaCohortes } from './graficos';

/**
 * Panel de uso (`/admin`, sólo admins): cómo usan la app los comercios.
 * El backend decide quién entra (403 al resto); la opción en "Más" sólo
 * aparece para admins. Todo es por comercio: nunca datos de sus clientes.
 */

const PERIODOS = [
  { value: '4', label: '4 semanas' },
  { value: '12', label: '12 semanas' },
  { value: '26', label: '6 meses' },
  { value: '52', label: '1 año' },
] as const;
type Periodo = (typeof PERIODOS)[number]['value'];

/** Semanas de retención que se muestran: con más, "100" no entra en la celda a 320 px. */
const COLUMNAS_COHORTE = 6;

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'error'; prohibido: boolean }
  | { tipo: 'listo'; datos: UsoReporte };

/** "Fiado · Cliente" a partir del registry; si la ruta ya no existe, su id. */
function nombrePantalla(modules: readonly AppModule[], modulo: string, rutaId: string): string {
  const m = modules.find((x) => x.id === modulo);
  const r = m?.routes.find((x) => x.id === rutaId);
  if (!m) return `${modulo} · ${rutaId}`;
  return `${m.label} · ${r?.title ?? rutaId}`;
}

export function AdminPage({ modules }: { modules: readonly AppModule[] }) {
  const [periodo, setPeriodo] = useState<Periodo>('12');
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const [recargando, setRecargando] = useState(false);
  const [intento, setIntento] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `intento` fuerza el reintento
  useEffect(() => {
    let vigente = true;
    setRecargando(true);
    adminApi
      .uso(Number(periodo))
      .then((datos) => vigente && setEstado({ tipo: 'listo', datos }))
      .catch(
        (err: Error) =>
          vigente && setEstado({ tipo: 'error', prohibido: err.message.startsWith('403') }),
      )
      .finally(() => vigente && setRecargando(false));
    return () => {
      vigente = false;
    };
  }, [periodo, intento]);

  return (
    <div className="flex flex-col gap-5 px-4 pt-4 pb-6">
      <ScreenHeader variant="task" title="Panel de uso" backTo="/mas" />

      {estado.tipo === 'error' && estado.prohibido && (
        <Card>
          <p className="m-0 text-body text-ink">Esta pantalla es solo para administradores.</p>
        </Card>
      )}

      {estado.tipo === 'error' && !estado.prohibido && (
        <Card>
          <p className="m-0 mb-4 text-body text-ink">No pudimos cargar el panel. Probá de nuevo.</p>
          <Button variant="primary" size="m" block onClick={() => setIntento((i) => i + 1)}>
            Reintentar
          </Button>
        </Card>
      )}

      {estado.tipo === 'cargando' && (
        <Card padding="compact">
          <EmptyNote>Cargando…</EmptyNote>
        </Card>
      )}

      {estado.tipo === 'listo' && (
        <>
          <FilterChips label="Período" options={PERIODOS} value={periodo} onChange={setPeriodo} />
          <div
            aria-busy={recargando}
            className={`flex flex-col gap-5 ${recargando ? 'opacity-60' : ''}`}
          >
            <Reporte datos={estado.datos} modules={modules} />
          </div>
        </>
      )}
    </div>
  );
}

function Reporte({ datos, modules }: { datos: UsoReporte; modules: readonly AppModule[] }) {
  const { totales } = datos;
  const semanas = datos.semanal.map((s) => s.semana);
  const desdeEventos = datos.eventos_desde ? lunesAR(datos.eventos_desde) : null;
  const altasPeriodo = datos.semanal.reduce((acc, s) => acc + s.altas, 0);
  const maxEmbudo = datos.embudo[0]?.comercios ?? 0;
  const adopcion = [...datos.adopcion].sort((a, b) => b.comercios - a.comercios);
  const deAdopcion = adopcion[0]?.de ?? 0;
  const cohortes = datos.cohortes.filter((c) => c.comercios > 0).slice(-COLUMNAS_COHORTE);

  return (
    <>
      <Card tone="dark">
        <p className="m-0 text-micro font-bold uppercase tracking-wide text-on-dark-muted">
          Esta semana
        </p>
        <p className="m-0 mt-1 font-display text-amount-xl text-surface">{totales.activos_7d}</p>
        <p className="m-0 text-body-s text-on-dark-body">
          comercios anotaron algo en los últimos 7 días, de {totales.comercios} registrados
        </p>
      </Card>

      <DataCells
        cells={[
          { label: 'Abrieron la app', value: totales.abrieron_7d },
          { label: 'Entraron (Clerk)', value: totales.ingresaron_7d ?? '—' },
          { label: 'Activos en 30 días', value: totales.activos_30d },
        ]}
      />
      <DataCells
        cells={[
          { label: 'Altas del período', value: altasPeriodo },
          { label: 'App instalada', value: totales.usan_instalada },
          { label: 'Desde el celular', value: totales.usan_celular },
        ]}
      />
      {totales.recargos_activos > 0 && (
        <DataCells
          cells={[
            { label: 'Con recargos', value: totales.recargos_activos },
            { label: 'Recargos sumados', value: totales.recargos_sumados },
            { label: 'No cobrados', value: totales.recargos_no_cobrados },
          ]}
        />
      )}
      {datos.ingresos === 'no_disponible' && (
        <Notice>Clerk no respondió: falta cuándo entró cada comercio por última vez.</Notice>
      )}

      <Section title="Semana por semana">
        <Card>
          {semanas.length === 0 ? (
            <EmptyNote>Todavía no hay semanas para mostrar.</EmptyNote>
          ) : (
            <LineasSemanales
              semanas={semanas}
              series={[
                {
                  nombre: 'Anotaron algo',
                  fondo: 'bg-chart-1',
                  trazo: 'var(--chart-1)',
                  valores: datos.semanal.map((s) => s.activos),
                },
                ...(desdeEventos
                  ? [
                      {
                        nombre: 'Abrieron la app',
                        fondo: 'bg-chart-2',
                        trazo: 'var(--chart-2)',
                        valores: datos.semanal.map((s) =>
                          s.semana >= desdeEventos ? s.abrieron : null,
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          )}
          <p className="m-0 mt-3 text-caption text-ink-muted">
            {datos.eventos_desde
              ? `La última semana todavía no terminó. Las aperturas se miden desde el ${fechaCorta(datos.eventos_desde)}.`
              : 'La última semana todavía no terminó. Las aperturas todavía no tienen registros: aparecen cuando alguien abra la app.'}
          </p>
          <details className="mt-3">
            <summary className="min-h-touch flex items-center text-body-s font-bold text-ink cursor-pointer">
              Ver como tabla
            </summary>
            <table className="w-full text-caption text-ink tabular-nums">
              <thead className="text-ink-muted">
                <tr>
                  <th scope="col" className="text-left font-bold py-1">
                    Semana
                  </th>
                  <th scope="col" className="text-right font-bold">
                    Altas
                  </th>
                  <th scope="col" className="text-right font-bold">
                    Anotaron
                  </th>
                  <th scope="col" className="text-right font-bold">
                    Abrieron
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...datos.semanal].reverse().map((s) => (
                  <tr key={s.semana} className="border-t border-line">
                    <th scope="row" className="text-left font-normal py-1">
                      {semanaCorta(s.semana)}
                    </th>
                    <td className="text-right">{s.altas}</td>
                    <td className="text-right">{s.activos}</td>
                    <td className="text-right">
                      {desdeEventos && s.semana >= desdeEventos ? s.abrieron : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </Card>
      </Section>

      <Section title="Hasta dónde llegan">
        <Card>
          <Barras
            etiqueta="Embudo de activación"
            max={maxEmbudo}
            filas={datos.embudo.map((p) => ({
              id: p.paso,
              etiqueta: p.paso,
              valor: p.comercios,
              texto: `${p.comercios} · ${porcentaje(p.comercios, maxEmbudo)}`,
            }))}
          />
        </Card>
      </Section>

      <Section title="Qué funciones usan">
        <Card>
          {deAdopcion === 0 ? (
            <EmptyNote>Todavía ningún comercio anotó un fiado.</EmptyNote>
          ) : (
            <>
              <p className="m-0 mb-4 text-caption text-ink-muted">
                De los {deAdopcion} comercios que ya anotaron algún fiado.
              </p>
              <Barras
                etiqueta="Uso de cada función"
                max={deAdopcion}
                filas={adopcion.map((a) => ({
                  id: a.funcion,
                  etiqueta: a.funcion,
                  valor: a.comercios,
                  texto: `${a.comercios} de ${a.de} · ${porcentaje(a.comercios, a.de)}`,
                }))}
              />
            </>
          )}
        </Card>
      </Section>

      <Section title="Pantallas más abiertas">
        <Card>
          {datos.pantallas.length === 0 ? (
            <EmptyNote>Todavía no hay pantallas registradas en este período.</EmptyNote>
          ) : (
            <>
              <p className="m-0 mb-4 text-caption text-ink-muted">
                Comercios distintos que abrieron cada pantalla en el período.
              </p>
              <Barras
                etiqueta="Pantallas más abiertas"
                max={Math.max(...datos.pantallas.map((p) => p.comercios))}
                filas={datos.pantallas.map((p) => ({
                  id: `${p.modulo}:${p.ruta_id}`,
                  etiqueta: nombrePantalla(modules, p.modulo, p.ruta_id),
                  valor: p.comercios,
                  texto: `${p.comercios} · ${p.vistas} ${p.vistas === 1 ? 'vez' : 'veces'}`,
                }))}
              />
            </>
          )}
        </Card>
      </Section>

      <Section title="Cuántos vuelven">
        <Card>
          {cohortes.length === 0 ? (
            <EmptyNote>No hubo altas en este período.</EmptyNote>
          ) : (
            <>
              <p className="m-0 mb-3 text-caption text-ink-muted">
                Por semana de alta: qué porcentaje anotó algo cada semana siguiente.
              </p>
              <MapaCohortes filas={cohortes} columnas={COLUMNAS_COHORTE} />
            </>
          )}
        </Card>
      </Section>

      <Section title="Comercios">
        {datos.comercios.length === 0 ? (
          <Card padding="compact">
            <EmptyNote>Todavía no se registró ningún comercio.</EmptyNote>
          </Card>
        ) : (
          <List label="Comercios">
            {datos.comercios.map((c) => (
              <ListRow
                key={c.user_id}
                title={c.comercio ?? c.email ?? `Comercio ${c.user_id}`}
                subtitle={
                  <>
                    {c.comercio && c.email && <span className="block truncate">{c.email}</span>}
                    <span className="block">
                      Anotó {haceCuanto(c.ultima_actividad)} · abrió{' '}
                      {haceCuanto(c.ultima_vista ?? c.ultimo_ingreso)}
                    </span>
                    <span className="block">
                      Alta {fechaCorta(c.alta)}
                      {c.instalada ? ' · app instalada' : ''}
                    </span>
                  </>
                }
                trailing={
                  <span className="flex-none text-right text-caption text-ink-muted tabular-nums">
                    <strong className="block text-body-s text-ink">{c.clientes}</strong>
                    {c.clientes === 1 ? 'cliente' : 'clientes'}
                  </span>
                }
              />
            ))}
          </List>
        )}
      </Section>
    </>
  );
}
