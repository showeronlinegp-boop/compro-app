import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../../host/ui/Button';
import { Keypad } from '../../../host/ui/Keypad';
import { ScreenHeader } from '../../../host/ui/ScreenHeader';
import { FilterChips, TextField } from '../../../host/ui/controls';
import { formatMoney } from '../../../host/ui/format';
import { Notice } from '../../../host/ui/surfaces';
import { SelectorCliente } from '../SelectorCliente';
import { type Cliente, type MovimientoResult, fiadoApi, mensajeDeError } from '../api';
import { RUTAS, type TipoAnotar } from '../rutas';
import { textoDia } from '../textos';
import { type Atajo, fechaDeAtajo, hoyAR, opcionesAtajo } from '../vence';

/** Lo que "Listo" recibe por `location.state`. */
export interface EstadoListo {
  tipo: TipoAnotar;
  resultado: MovimientoResult;
}

/** Clave única por pantalla: el backend ignora el segundo envío (doble toque). */
export function nuevaClave(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const TEXTOS: Record<TipoAnotar, { titulo: string; color: string; confirmar: string }> = {
  fiado: { titulo: 'Anotar fiado', color: 'text-fiado', confirmar: 'Anotar fiado' },
  pago: { titulo: 'Registrar pago', color: 'text-pago', confirmar: 'Registrar pago' },
};

/**
 * Anotar fiado / Registrar pago (pantalla de tarea). El monto se carga con el
 * teclado propio; al confirmar se pasa SIEMPRE por "Listo", que reemplaza a
 * esta pantalla en el historial (volver desde "Listo" lleva al origen).
 */
export function Anotar({ tipo }: { tipo: TipoAnotar }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const clienteParam = Number(params.get('cliente')) || null;

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [monto, setMonto] = useState('');
  const [nota, setNota] = useState('');
  const [atajo, setAtajo] = useState<Atajo>('sin');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clave = useRef(nuevaClave());
  const t = TEXTOS[tipo];

  // Cliente preelegido (desde la ficha o recién creado).
  useEffect(() => {
    if (!clienteParam) return;
    let vigente = true;
    fiadoApi
      .ficha(clienteParam)
      .then((f) => {
        if (vigente) setCliente(f.cliente);
      })
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [clienteParam]);

  const hoy = hoyAR();
  const vence = tipo === 'fiado' ? fechaDeAtajo(atajo, hoy) : null;
  const valor = Number(monto || '0');
  // Con recargos activos, primero hay que avisarle las condiciones (el backend también lo exige).
  const faltaAviso = tipo === 'fiado' && cliente?.aviso_recargo_pendiente === true;
  const puedeConfirmar = cliente != null && valor > 0 && !enviando && !faltaAviso;

  async function confirmar() {
    if (!cliente || !puedeConfirmar) return;
    setEnviando(true);
    setError(null);
    try {
      const resultado = await fiadoApi.crearMovimiento({
        cliente_id: cliente.id,
        tipo,
        monto: valor,
        nota: nota.trim() || null,
        vence,
        idempotency_key: clave.current,
      });
      const estado: EstadoListo = { tipo, resultado };
      navigate(RUTAS.listo, { replace: true, state: estado });
    } catch (err) {
      setError(mensajeDeError(err));
      setEnviando(false);
    }
  }

  function crearCliente(nombre: string) {
    navigate(RUTAS.nuevoCliente({ nombre: nombre || undefined, siguiente: location.pathname }), {
      replace: true,
    });
  }

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-6">
      <ScreenHeader
        variant="task"
        title={t.titulo}
        titleClassName={t.color}
        backTo={RUTAS.inicio}
      />

      <SelectorCliente cliente={cliente} onElegir={setCliente} onCrear={crearCliente} />

      {faltaAviso && cliente && (
        <div className="flex flex-col gap-2">
          <Notice>
            Antes de anotarle un fiado a {cliente.nombre}, avisale las condiciones de recargo.
          </Notice>
          <Button variant="outline" size="s" onClick={() => navigate(RUTAS.ficha(cliente.id))}>
            Ir a su ficha para avisarle
          </Button>
        </div>
      )}

      <div className="text-center" aria-live="polite">
        <p className="m-0 text-caption text-ink-muted">Monto</p>
        <p
          className={`m-0 font-display text-amount-l ${valor > 0 ? t.color : 'text-ink-disabled'}`}
        >
          {formatMoney(valor)}
        </p>
      </div>

      {tipo === 'pago' && cliente && cliente.saldo > 0 && (
        <Button
          variant="outline-pago"
          size="chip"
          className="self-center"
          onClick={() => setMonto(String(cliente.saldo))}
        >
          Pagó todo ({formatMoney(cliente.saldo)})
        </Button>
      )}

      <Keypad value={monto} onChange={setMonto} />

      <TextField
        label="Nota (opcional)"
        size="compact"
        placeholder={tipo === 'fiado' ? 'Ej.: yerba y galletitas' : 'Ej.: transferencia'}
        value={nota}
        maxLength={200}
        onChange={(e) => setNota(e.target.value)}
      />

      {tipo === 'fiado' && (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-caption text-ink-muted">¿Cuándo te lo paga?</p>
          <FilterChips
            label="¿Cuándo te lo paga?"
            options={opcionesAtajo(hoy)}
            value={atajo}
            onChange={setAtajo}
          />
          <p className="m-0 text-caption text-ink-muted" aria-live="polite">
            {vence
              ? `Vence el ${textoDia(vence)}. Ese día aparece en “Para cobrar hoy”.`
              : 'Sin fecha: vence a los días de deuda vieja que pusiste en Ajustes.'}
          </p>
        </div>
      )}

      {error && <Notice>{error}</Notice>}

      <Button variant={tipo} size="l" block disabled={!puedeConfirmar} onClick={confirmar}>
        {enviando ? 'Guardando…' : t.confirmar}
      </Button>
    </div>
  );
}

export function AnotarFiado() {
  return <Anotar tipo="fiado" />;
}

export function RegistrarPago() {
  return <Anotar tipo="pago" />;
}
