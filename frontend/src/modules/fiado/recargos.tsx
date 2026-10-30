import { useEffect, useRef, useState } from 'react';
import { Button } from '../../host/ui/Button';
import { formatMoney } from '../../host/ui/format';
import { FOCUS_RING } from '../../host/ui/styles';
import { Notice, WhatsAppBubble } from '../../host/ui/surfaces';
import {
  type Cliente,
  type Movimiento,
  type RecargoFicha,
  type RecargosResult,
  fiadoApi,
  mensajeDeError,
} from './api';
import { abrirWhatsApp } from './mensajes';
import { nuevaClave } from './pages/Anotar';
import { primerNombre, textoDia } from './textos';

/**
 * Piezas de los recargos por atraso (propuesta "Recargos por atraso"):
 * el aviso obligatorio de condiciones, la sugerencia de la ficha y el botón
 * para perdonar un recargo desde el historial.
 */

/** Lo que "Listo" recibe por `location.state` después de sumar recargos. */
export interface EstadoListoRecargo {
  tipo: 'recargo';
  resultado: RecargosResult;
  /** fiado_id → 'AAAA-MM-DD' en que se anotó (para el comprobante). */
  fiados: Record<number, string>;
}

/**
 * Para mostrar: que "5 %" y "$ 12.000" no se partan entre dos líneas. El texto
 * que se manda por WhatsApp no cambia.
 */
export function sinCortes(texto: string): string {
  return texto.replace(/ %/g, '\u00a0%').replace(/\$ /g, '$\u00a0');
}

// ─── Aviso de condiciones ─────────────────────────────────────────────────────

/**
 * Hay que avisarle las condiciones antes de anotarle fiados o recargos. El
 * texto es fijo (lo arma el backend). Se registra al abrir WhatsApp o al
 * tocar "Cambio informado"; los dos quedan guardados sin poder borrarse.
 */
export function TarjetaAvisoRecargo({
  cliente,
  texto,
  onAvisado,
}: {
  cliente: Cliente;
  texto: string;
  onAvisado: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function registrar(via: 'whatsapp' | 'informado') {
    setEnviando(true);
    setError(null);
    // WhatsApp se abre en el mismo gesto del usuario (si no, el navegador lo bloquea).
    if (via === 'whatsapp') abrirWhatsApp(cliente.whatsapp, texto);
    try {
      await fiadoApi.avisarRecargo(cliente.id, via);
      onAvisado();
    } catch (err) {
      setError(mensajeDeError(err));
      setEnviando(false);
    }
  }

  return (
    <section
      aria-label="Aviso de condiciones de recargo"
      className="flex flex-col gap-3 rounded-xl border-[1.5px] border-warn-strong bg-warn-bg p-4"
    >
      <h2 className="m-0 font-display text-title-s text-warn">
        Avisale a {primerNombre(cliente.nombre)} las condiciones de recargo
      </h2>
      <WhatsAppBubble text={sinCortes(texto)} />
      <p className="m-0 text-body-s text-warn">
        Hasta que le avises, podés registrarle pagos, pero no fiados nuevos ni recargos.
      </p>
      {error && <Notice>{error}</Notice>}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="whatsapp"
          size="m"
          disabled={enviando}
          onClick={() => void registrar('whatsapp')}
        >
          Enviar por WhatsApp
        </Button>
        <Button
          variant="soft"
          size="m"
          disabled={enviando}
          onClick={() => void registrar('informado')}
        >
          Cambio informado
        </Button>
      </div>
    </section>
  );
}

// ─── Sugerencia de la ficha ───────────────────────────────────────────────────

/**
 * Recargos que corresponde sumar hoy, uno por fiado (cada uno con su
 * calendario). "No cobrar" saltea ese período; "Sumar recargos" anota los que
 * queden, cada uno en su fila del historial.
 */
export function TarjetaRecargos({
  clienteId,
  recargo,
  onCambio,
  onSumados,
}: {
  clienteId: number;
  recargo: RecargoFicha;
  /** Después de "No cobrar": recargar la ficha. */
  onCambio: () => void;
  onSumados: (estado: EstadoListoRecargo) => void;
}) {
  const clave = useRef(nuevaClave());
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sumar() {
    setOcupado(true);
    setError(null);
    try {
      const resultado = await fiadoApi.sumarRecargos(clienteId, clave.current);
      const fiados = Object.fromEntries(recargo.sugeridos.map((s) => [s.fiado_id, s.fiado_fecha]));
      onSumados({ tipo: 'recargo', resultado, fiados });
    } catch (err) {
      setError(mensajeDeError(err));
      setOcupado(false);
    }
  }

  async function noCobrar(fiadoId: number) {
    setOcupado(true);
    setError(null);
    try {
      await fiadoApi.omitirRecargo(clienteId, fiadoId);
      onCambio();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section
      aria-label="Recargos para sumar"
      className="flex flex-col gap-3 rounded-xl border-[1.5px] border-late bg-late-bg p-4"
    >
      <div>
        <p className="m-0 text-body-s font-bold text-late">Recargos por atraso para sumar</p>
        <p className="m-0 font-display text-amount-m text-ink">{formatMoney(recargo.total)}</p>
      </div>
      <ul className="m-0 p-0 list-none flex flex-col gap-2">
        {recargo.sugeridos.map((s) => (
          <li
            key={s.fiado_id}
            className="flex items-center justify-between gap-3 rounded-m bg-surface px-3 py-2"
          >
            <span className="min-w-0">
              <span className="block text-body-s font-bold text-ink">
                Fiado del {textoDia(s.fiado_fecha)}: {formatMoney(s.monto)}
              </span>
              <span className="block text-caption text-ink-muted">{sinCortes(s.detalle)}</span>
            </span>
            <Button
              variant="soft"
              size="s"
              className="flex-none"
              disabled={ocupado}
              onClick={() => void noCobrar(s.fiado_id)}
            >
              No cobrar
            </Button>
          </li>
        ))}
      </ul>
      {error && <Notice>{error}</Notice>}
      <Button variant="primary" size="m" block disabled={ocupado} onClick={() => void sumar()}>
        {recargo.sugeridos.length === 1 ? 'Sumar recargo' : 'Sumar recargos'}
      </Button>
    </section>
  );
}

// ─── Perdonar un recargo ──────────────────────────────────────────────────────

/** Cuánto dura la confirmación de "Perdonar" antes de volver al estado normal. */
const CONFIRMAR_MS = 5000;

/**
 * "Perdonar" en la fila de un recargo sin pagar. Pide un segundo toque porque
 * una corrección no se puede deshacer. Perdona sólo ese recargo.
 */
export function BotonPerdonar({
  recargo,
  onPerdonado,
}: {
  recargo: Movimiento;
  onPerdonado: (error: string | null) => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!confirmando) return;
    const t = setTimeout(() => setConfirmando(false), CONFIRMAR_MS);
    return () => clearTimeout(t);
  }, [confirmando]);

  async function perdonar() {
    setEnviando(true);
    try {
      await fiadoApi.corregir(recargo.id);
      onPerdonado(null);
    } catch (err) {
      onPerdonado(mensajeDeError(err));
      setEnviando(false);
      setConfirmando(false);
    }
  }

  return confirmando ? (
    <Button variant="outline" size="s" disabled={enviando} onClick={() => void perdonar()}>
      Sí, perdonar
    </Button>
  ) : (
    <Button variant="text" size="s" onClick={() => setConfirmando(true)}>
      Perdonar
    </Button>
  );
}

// ─── Interruptor ──────────────────────────────────────────────────────────────

/** Interruptor accesible (`role="switch"`), 44 px de alto como todo lo tocable. */
export function Interruptor({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`pressable flex w-full min-h-touch items-center justify-between gap-3 text-left ${FOCUS_RING}`}
    >
      <span className="min-w-0">
        <span className="block text-body font-bold text-ink">{label}</span>
        {hint && <span className="block text-caption text-ink-muted">{hint}</span>}
      </span>
      <span
        aria-hidden="true"
        className={`relative h-7 w-12 flex-none rounded-pill transition-colors ${
          checked ? 'bg-ok' : 'bg-border'
        }`}
      >
        <span
          className={`absolute top-[3px] h-[22px] w-[22px] rounded-pill bg-surface transition-[left] ${
            checked ? 'left-[23px]' : 'left-[3px]'
          }`}
        />
      </span>
    </button>
  );
}
