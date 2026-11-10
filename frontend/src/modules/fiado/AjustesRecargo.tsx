import { Button } from '../../host/ui/Button';
import { FilterChips, TextField } from '../../host/ui/controls';
import { formatMoney } from '../../host/ui/format';
import { Card, Section } from '../../host/ui/surfaces';
import { TERMINOS_RECARGO_URL } from './TerminosRecargo';
import type { ConfigRecargo, EsquemaRecargo } from './api';
import { Interruptor } from './recargos';

/**
 * Sección "Recargo por atraso" de Ajustes. Trabaja sobre un borrador de
 * texto (lo que se tipea) y lo convierte a `ConfigRecargo` al guardar; las
 * reglas finas (rangos, tramos crecientes) las valida el backend y su mensaje
 * se muestra como cualquier error de Ajustes.
 */

export interface BorradorRecargo {
  activo: boolean;
  esquema: EsquemaRecargo;
  tipo: 'pct' | 'fijo';
  valor: string;
  /** Hasta 3; el último puede no tener fin (`hasta` vacío). */
  tramos: { hasta: string; pct: string }[];
  tolerancia: string;
  desde: 'vencimiento' | 'activacion';
}

export const TRAMOS_MAX = 3;

const TRAMOS_DEFAULT = [
  { hasta: '30', pct: '5' },
  { hasta: '60', pct: '10' },
  { hasta: '', pct: '20' },
];

/** Borrador a partir de lo guardado (o valores de ejemplo si está apagado). */
export function borradorDe(c: ConfigRecargo | null): BorradorRecargo {
  return {
    activo: c !== null,
    esquema: c?.esquema ?? 'mes',
    tipo: c?.tipo ?? 'pct',
    valor: c?.valor != null ? String(c.valor).replace('.', ',') : '5',
    tramos:
      c?.tramos?.map((t) => ({
        hasta: t.hasta != null ? String(t.hasta) : '',
        pct: String(t.pct).replace('.', ','),
      })) ?? TRAMOS_DEFAULT,
    tolerancia: c ? String(c.tolerancia) : '7',
    desde: c?.desde ?? 'vencimiento',
  };
}

/** "2,5" → 2.5 (acepta coma o punto). */
const num = (s: string) => Number(s.trim().replace(',', '.'));

/** Lo que se manda al backend: null = apagar. */
export function configDe(b: BorradorRecargo): Omit<ConfigRecargo, 'activado_el'> | null {
  if (!b.activo) return null;
  const comun = { tolerancia: num(b.tolerancia || '0'), desde: b.desde };
  if (b.esquema === 'tramos') {
    return {
      esquema: 'tramos',
      tramos: b.tramos.map((t, i) => ({
        hasta: i === b.tramos.length - 1 && t.hasta.trim() === '' ? null : num(t.hasta),
        pct: num(t.pct),
      })),
      ...comun,
    };
  }
  return { esquema: b.esquema, tipo: b.tipo, valor: num(b.valor), ...comun };
}

const ESQUEMAS = [
  { value: 'mes', label: 'Cada mes' },
  { value: 'semana', label: 'Cada semana' },
  { value: 'dia', label: 'Cada día' },
  { value: 'tramos', label: 'Por tramos' },
] as const;

const TIPOS = [
  { value: 'pct', label: 'Un porcentaje' },
  { value: 'fijo', label: 'Un monto fijo' },
] as const;

const DESDE = [
  { value: 'vencimiento', label: 'Desde que vencieron' },
  { value: 'activacion', label: 'Desde hoy' },
] as const;

/** Monto de ejemplo para que el comercio vea en pesos lo que configura. */
const BASE_EJEMPLO = 10_000;

/**
 * Un ejemplo con números: cuánto se le suma a un fiado de $ 10.000 atrasado
 * un período (o en el primer tramo). Redondea como el backend: múltiplos de
 * $ 10, hacia abajo. null si todavía no hay un valor válido.
 */
export function ejemploRecargo(b: BorradorRecargo): string | null {
  const abajo = (n: number) => Math.floor(n / 10) * 10;
  let monto: number;
  let cuando: string;
  if (b.esquema === 'tramos') {
    const t = b.tramos[0];
    const pct = num(t?.pct ?? '');
    if (!t || !Number.isFinite(pct) || pct <= 0) return null;
    monto = abajo((BASE_EJEMPLO * pct) / 100);
    cuando = t.hasta.trim() ? `hasta ${t.hasta.trim()} días` : 'unos días';
  } else {
    const v = num(b.valor);
    if (!Number.isFinite(v) || v <= 0) return null;
    monto = abajo(b.tipo === 'pct' ? (BASE_EJEMPLO * v) / 100 : v);
    cuando = b.esquema === 'mes' ? 'un mes' : b.esquema === 'semana' ? 'una semana' : 'un día';
  }
  if (monto <= 0) return null;
  return `Ejemplo: si un fiado de ${formatMoney(BASE_EJEMPLO)} se atrasa ${cuando} (pasados los días de espera), se le suman ${formatMoney(monto)}.`;
}

/**
 * Por día, el porcentaje engaña: 1 % por día son 30 % por mes. Mostramos el
 * equivalente mensual para que el comercio vea lo que va a pagar el cliente.
 */
export function equivalenteMensual(b: BorradorRecargo): string | null {
  if (b.esquema !== 'dia' || b.tipo !== 'pct') return null;
  const v = num(b.valor);
  if (!Number.isFinite(v) || v <= 0) return null;
  const mes = (v * 30).toLocaleString('es-AR', { maximumFractionDigits: 2 });
  return `Equivale a ${mes} % por mes.`;
}

const soloNumero = (v: string, max: number) => v.replace(/[^\d,.]/g, '').slice(0, max);

export function SeccionRecargo({
  borrador: b,
  onChange,
  condiciones,
}: {
  borrador: BorradorRecargo;
  onChange: (b: BorradorRecargo) => void;
  /** Las condiciones guardadas en una frase (lo que leen los clientes). */
  condiciones: string | null;
}) {
  const set = (patch: Partial<BorradorRecargo>) => onChange({ ...b, ...patch });
  const setTramo = (i: number, patch: Partial<{ hasta: string; pct: string }>) =>
    set({ tramos: b.tramos.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const periodo = b.esquema === 'mes' ? 'mes' : b.esquema === 'semana' ? 'semana' : 'día';
  const equivalente = equivalenteMensual(b);
  const ejemplo = ejemploRecargo(b);

  return (
    <Section title="Recargo por atraso">
      <Card>
        <div className="flex flex-col gap-4">
          <Interruptor
            label="Sugerir recargos cuando se atrasan"
            hint="Te mostramos en la ficha del cliente cuánto sumarle. Nunca se suma solo: vos decidís."
            checked={b.activo}
            onChange={(activo) => set({ activo })}
          />

          {b.activo && (
            <>
              <p className="m-0 rounded-m bg-warn-bg p-3 text-body-s text-warn">
                Tus clientes tienen que conocer las condiciones antes de que les sumes un recargo.
                Van solas en el próximo comprobante de fiado, o se las avisás desde su ficha.
                Informarle es tu responsabilidad.{' '}
                <a
                  className="font-bold text-warn underline"
                  href={TERMINOS_RECARGO_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ver términos
                </a>
              </p>

              <div className="flex flex-col gap-2">
                <p className="m-0 text-caption text-ink-muted">¿Cada cuánto se suma?</p>
                <FilterChips
                  label="¿Cada cuánto se suma?"
                  options={ESQUEMAS}
                  value={b.esquema}
                  onChange={(esquema) => set({ esquema })}
                />
              </div>

              {b.esquema !== 'tramos' ? (
                <>
                  <p className="m-0 -mb-2 text-caption text-ink-muted">¿Cuánto se suma?</p>
                  <FilterChips
                    label="¿Cuánto se suma?"
                    options={TIPOS}
                    value={b.tipo}
                    onChange={(tipo) => set({ tipo })}
                  />
                  <TextField
                    label={
                      b.tipo === 'pct'
                        ? `Recargo por cada ${periodo} de atraso (%)`
                        : `Recargo por cada ${periodo} de atraso ($)`
                    }
                    inputMode="decimal"
                    value={b.valor}
                    onChange={(e) =>
                      set({ valor: soloNumero(e.target.value, b.tipo === 'pct' ? 6 : 7) })
                    }
                    hint={[
                      b.tipo === 'pct'
                        ? 'Sobre lo que falta pagar de cada fiado atrasado.'
                        : 'Se suma por cada fiado atrasado. Múltiplos de $ 10.',
                      equivalente,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  />
                </>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="m-0 text-caption text-ink-muted">
                    El porcentaje de cada tramo es el total, no se suma a los anteriores.
                  </p>
                  {b.tramos.map((t, i) => {
                    const ultimo = i === b.tramos.length - 1;
                    return (
                      // biome-ignore lint/suspicious/noArrayIndexKey: los tramos no tienen id; se agregan y quitan al final
                      <div key={i} className="grid grid-cols-2 gap-2">
                        <TextField
                          label={`Tramo ${i + 1}: hasta (días)`}
                          inputMode="numeric"
                          placeholder={ultimo ? 'Sin fin' : ''}
                          value={t.hasta}
                          onChange={(e) =>
                            setTramo(i, { hasta: e.target.value.replace(/\D/g, '').slice(0, 4) })
                          }
                        />
                        <TextField
                          label={`Tramo ${i + 1}: recargo (%)`}
                          inputMode="decimal"
                          value={t.pct}
                          onChange={(e) => setTramo(i, { pct: soloNumero(e.target.value, 6) })}
                        />
                      </div>
                    );
                  })}
                  <div className="flex flex-wrap gap-2">
                    {b.tramos.length < TRAMOS_MAX && (
                      <Button
                        variant="soft"
                        size="chip"
                        onClick={() => set({ tramos: [...b.tramos, { hasta: '', pct: '' }] })}
                      >
                        + Agregar tramo
                      </Button>
                    )}
                    {b.tramos.length > 1 && (
                      <Button
                        variant="soft"
                        size="chip"
                        onClick={() => set({ tramos: b.tramos.slice(0, -1) })}
                      >
                        Quitar el último
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {ejemplo && (
                <p className="m-0 rounded-m bg-bg p-3 text-body-s text-ink">{ejemplo}</p>
              )}

              <TextField
                label="Días de espera"
                inputMode="numeric"
                value={b.tolerancia}
                onChange={(e) => set({ tolerancia: e.target.value.replace(/\D/g, '').slice(0, 2) })}
                hint="Después de la fecha de pago, cuántos días esperar antes del primer recargo."
              />

              <div className="flex flex-col gap-2">
                <p className="m-0 text-caption text-ink-muted">
                  Los fiados que ya estaban atrasados cuando lo prendés, ¿desde cuándo cuentan?
                </p>
                <FilterChips
                  label="Los fiados que ya estaban atrasados, ¿desde cuándo cuentan?"
                  options={DESDE}
                  value={b.desde}
                  onChange={(desde) => set({ desde })}
                />
              </div>

              {condiciones && (
                <p className="m-0 text-body-s text-ink-muted">
                  Así lo leen tus clientes hoy: “{condiciones}”.
                </p>
              )}
            </>
          )}
        </div>
      </Card>
    </Section>
  );
}
