import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../host/ui/Button';
import { Keypad } from '../../../host/ui/Keypad';
import { formatMoney } from '../../../host/ui/format';
import { IconBack, IconCheck, IconChevron } from '../../../host/ui/icons';
import { FOCUS_RING } from '../../../host/ui/styles';
import { Card, List, WhatsAppBubble } from '../../../host/ui/surfaces';
import type { Cliente } from '../api';
import { AccionesMovimiento, FilaCliente, TarjetaTeDeben } from '../components';
import { abrirWhatsApp, comprobante } from '../mensajes';
import { AJUSTES_PRUEBA, clientesIniciales, conMovimiento } from '../prueba';
import { RUTAS } from '../rutas';
import { primerNombre, textoSaldo } from '../textos';

type Tipo = 'fiado' | 'pago';

type Paso =
  | { en: 'inicio' }
  | { en: 'anotar'; tipo: Tipo; clienteId: number | null }
  | { en: 'listo'; tipo: Tipo; monto: number; clienteId: number };

/** Marca lo que hay que tocar en este paso de la guía. */
const DESTACADO = 'outline outline-4 outline-fiado outline-offset-4 rounded-m';

const TOTAL_PASOS = 4;

/** Qué se marca en Anotar según el paso de la guía. */
const QUE_DESTACAR: Record<number, 'clientes' | 'teclado' | 'confirmar'> = {
  1: 'clientes',
  2: 'teclado',
  3: 'confirmar',
};

const BOTON_VOLVER = `pressable flex-none -ml-2 inline-flex items-center justify-center min-h-touch min-w-touch text-ink ${FOCUS_RING}`;

/**
 * Modo prueba (plan de adopción, fase 2, punto 6): la libreta con clientes de
 * ejemplo, sin cuenta. Arranca con una guía de 4 pasos (elegir cliente, monto,
 * anotar y mandar el comprobante) que avanza sola a medida que se hace cada
 * cosa y se puede saltear. Todo vive en el estado de esta pantalla: no toca el
 * backend ni el almacenamiento, y al salir o recargar vuelve a empezar.
 */
export default function Probar() {
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<Cliente[]>(clientesIniciales);
  const [paso, setPaso] = useState<Paso>({ en: 'inicio' });
  const [presentacion, setPresentacion] = useState(true);
  const [guia, setGuia] = useState(true);
  const [enviado, setEnviado] = useState(false);
  const [monto, setMonto] = useState('');
  const arriba = useRef<HTMLDivElement>(null);

  // Cada paso es otra "pantalla": arranca desde arriba, con la guía a la vista.
  // biome-ignore lint/correctness/useExhaustiveDependencies: sólo al cambiar de pantalla
  useEffect(() => {
    arriba.current?.scrollIntoView?.({ block: 'start' });
  }, [paso.en, presentacion]);

  const saltear = () => setGuia(false);
  const anotar = (tipo: Tipo, clienteId: number | null = null) => {
    setMonto('');
    setPaso({ en: 'anotar', tipo, clienteId });
  };

  let pantalla: ReactNode = null;
  let cartel: ReactNode = null;
  if (presentacion) {
    pantalla = (
      <Presentacion
        onEmpezar={() => setPresentacion(false)}
        onSinGuia={() => {
          setGuia(false);
          setPresentacion(false);
        }}
        onVolver={() => navigate(RUTAS.inicio)}
      />
    );
  } else if (paso.en === 'anotar') {
    const valor = Number(monto) || 0;
    const elegido = paso.clienteId != null;
    const verbo = paso.tipo === 'fiado' ? 'Anotar fiado' : 'Registrar pago';
    const guiaAhora = !guia
      ? null
      : !elegido
        ? { n: 1, texto: 'Elegí a quién se lo anotás. Por ejemplo, a Marta.' }
        : valor === 0
          ? {
              n: 2,
              texto:
                paso.tipo === 'fiado'
                  ? 'Marcá con el teclado cuánto se llevó. Por ejemplo, 2000.'
                  : 'Marcá con el teclado cuánto te pagó.',
            }
          : { n: 3, texto: `Tocá “${verbo}” para guardarlo.` };
    if (guiaAhora) cartel = <Guia n={guiaAhora.n} texto={guiaAhora.texto} onSaltear={saltear} />;
    pantalla = (
      <AnotarPrueba
        tipo={paso.tipo}
        clientes={clientes}
        clienteId={paso.clienteId}
        monto={monto}
        onMonto={setMonto}
        onCliente={(id) => setPaso({ ...paso, clienteId: id })}
        onVolver={() => setPaso({ en: 'inicio' })}
        destacar={guiaAhora ? (QUE_DESTACAR[guiaAhora.n] ?? null) : null}
        onConfirmar={(clienteId, total) => {
          setClientes((cs) =>
            cs.map((c) => (c.id === clienteId ? conMovimiento(c, paso.tipo, total) : c)),
          );
          setPaso({ en: 'listo', tipo: paso.tipo, monto: total, clienteId });
        }}
      />
    );
  } else if (paso.en === 'listo') {
    const cliente = clientes.find((c) => c.id === paso.clienteId);
    const guiaAhora = guia && !enviado;
    if (cliente) {
      if (guiaAhora)
        cartel = (
          <Guia
            n={4}
            texto="Así le llega el comprobante a tu cliente. Tocá “Enviar por WhatsApp”."
            onSaltear={saltear}
          />
        );
      pantalla = (
        <ListoPrueba
          tipo={paso.tipo}
          monto={paso.monto}
          cliente={cliente}
          destacarEnviar={guiaAhora}
          onEnviar={() => setEnviado(true)}
          onSeguir={() => setPaso({ en: 'inicio' })}
        />
      );
    }
  } else {
    if (guia)
      cartel = enviado ? (
        <GuiaFinal onCuenta={() => navigate('/sign-up')} onCerrar={saltear} />
      ) : (
        <Guia n={1} texto="Tocá a Marta Giménez para anotarle un fiado." onSaltear={saltear} />
      );
    pantalla = (
      <InicioPrueba
        clientes={clientes}
        onAnotar={anotar}
        destacarMarta={guia && !enviado}
      />
    );
  }

  return (
    <div ref={arriba} className="flex flex-col min-h-full">
      {/* El aviso de prueba y la guía quedan fijos arriba: la guía no se pierde al bajar. */}
      <div className="sticky top-0 z-10">
        <BannerPrueba />
        {cartel}
      </div>
      {pantalla}
    </div>
  );
}

/** Fijo arriba: se está probando y nada se guarda. */
function BannerPrueba() {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-ink text-surface">
      <p className="m-0 flex-1 text-body-s">
        Estás probando. Nada se guarda.
      </p>
      <Button variant="on-dark" size="s" onClick={() => navigate('/sign-up')}>
        Crear cuenta
      </Button>
    </div>
  );
}

const QUE_VAS_A_APRENDER = [
  'Elegir a quién le fiás.',
  'Marcar cuánto se llevó.',
  'Anotarlo en la libreta.',
  'Mandarle el comprobante por WhatsApp.',
] as const;

/** Antes de la guía: qué se va a aprender y con qué clientes. */
function Presentacion({
  onEmpezar,
  onSinGuia,
  onVolver,
}: {
  onEmpezar: () => void;
  onSinGuia: () => void;
  onVolver: () => void;
}) {
  return (
    <div className="flex flex-col gap-6 px-4 pt-4 pb-8">
      <header>
        <button type="button" aria-label="Volver" onClick={onVolver} className={BOTON_VOLVER}>
          <IconBack />
        </button>
      </header>

      <div className="flex flex-col gap-3">
        <p className="m-0 self-start rounded-pill bg-fiado px-3 py-1 text-caption font-bold text-surface">
          Guía · 1 minuto
        </p>
        <h1 className="m-0 font-display text-amount-m text-ink">
          Vamos a aprender a usar la app
        </h1>
        <p className="m-0 text-body-l text-ink-muted">
          Te mostramos paso a paso cómo anotar un fiado, con clientes de ejemplo. No se guarda
          nada.
        </p>
      </div>

      <Card>
        <p className="m-0 mb-4 text-body font-bold text-ink">Vas a aprender a:</p>
        <ol className="m-0 p-0 list-none flex flex-col gap-4">
          {QUE_VAS_A_APRENDER.map((t, i) => (
            <li key={t} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex-none w-9 h-9 rounded-pill bg-fiado text-surface font-display text-body-l inline-flex items-center justify-center"
              >
                {i + 1}
              </span>
              <span className="text-body-l text-ink">{t}</span>
            </li>
          ))}
        </ol>
      </Card>

      <div className="flex flex-col gap-2">
        <Button variant="fiado" size="xl" block onClick={onEmpezar}>
          Empezar
        </Button>
        <Button variant="text" size="m" block onClick={onSinGuia}>
          Prefiero probar sin la guía
        </Button>
      </div>
    </div>
  );
}

/** Cartel de la guía: en qué paso va y qué tocar. Naranja y fijo arriba. */
function Guia({ n, texto, onSaltear }: { n: number; texto: string; onSaltear: () => void }) {
  return (
    <section
      aria-label="Guía"
      aria-live="polite"
      className="flex flex-col gap-1 px-4 pt-1 pb-3 bg-fiado text-surface"
    >
      <div className="flex items-center gap-3">
        <p className="m-0 flex-none text-caption font-bold">
          Paso {n} de {TOTAL_PASOS}
        </p>
        <div aria-hidden="true" className="flex flex-1 gap-1">
          {PASOS_GUIA.map((i) => (
            <span
              key={i}
              className={`h-2 flex-1 rounded-pill border-2 border-surface ${i <= n ? 'bg-surface' : ''}`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={onSaltear}
          className={`flex-none min-h-touch px-1 text-body-s underline ${FOCUS_RING}`}
        >
          Saltear la guía
        </button>
      </div>
      <p className="m-0 font-display text-title-s">{texto}</p>
    </section>
  );
}

const PASOS_GUIA = Array.from({ length: TOTAL_PASOS }, (_, i) => i + 1);

function GuiaFinal({ onCuenta, onCerrar }: { onCuenta: () => void; onCerrar: () => void }) {
  return (
    <section
      aria-label="Guía"
      aria-live="polite"
      className="flex flex-col gap-3 px-4 py-4 bg-fiado text-surface"
    >
      <p className="m-0 font-display text-title-s">¡Ya sabés usarlo!</p>
      <p className="m-0 text-body">
        Así de simple es anotar un fiado y mandarle el comprobante. Seguí probando, o creá tu
        cuenta para anotar a tus clientes.
      </p>
      <div className="flex items-center gap-2">
        <Button variant="on-dark" size="m" onClick={onCuenta}>
          Crear mi cuenta
        </Button>
        <button
          type="button"
          onClick={onCerrar}
          className={`min-h-touch px-3 text-body font-bold underline ${FOCUS_RING}`}
        >
          Seguir probando
        </button>
      </div>
    </section>
  );
}

/** Marca lo que hay que tocar: borde naranja y un cartelito arriba ("Tocá acá"). */
function Senalado({
  si,
  texto = 'Tocá acá',
  children,
}: {
  si: boolean;
  texto?: string;
  children: ReactNode;
}) {
  if (!si) return <>{children}</>;
  return (
    <div className="flex flex-col gap-3">
      <span className="self-start inline-flex items-center gap-1 rounded-pill bg-fiado px-3 py-1 text-caption font-bold text-surface">
        {texto}
        <span aria-hidden="true" className="inline-flex rotate-90">
          <IconChevron size={14} />
        </span>
      </span>
      <div className={DESTACADO}>{children}</div>
    </div>
  );
}

function InicioPrueba({
  clientes,
  onAnotar,
  destacarMarta,
}: {
  clientes: readonly Cliente[];
  onAnotar: (tipo: Tipo, clienteId?: number) => void;
  destacarMarta: boolean;
}) {
  const navigate = useNavigate();
  const conDeuda = clientes.filter((c) => c.saldo > 0);
  const total = conDeuda.reduce((acc, c) => acc + c.saldo, 0);
  const [primero, ...resto] = clientes;
  return (
    <div className="flex flex-col gap-5 px-4 py-6">
      <header className="flex items-start gap-2">
        <button
          type="button"
          aria-label="Volver"
          onClick={() => navigate(RUTAS.inicio)}
          className={BOTON_VOLVER}
        >
          <IconBack />
        </button>
        <div className="min-w-0">
          <p className="m-0 text-body text-ink-muted">{AJUSTES_PRUEBA.comercio} (de ejemplo)</p>
          <h1 className="m-0 font-display text-title-m text-ink">Probá anotar un fiado</h1>
        </div>
      </header>

      <TarjetaTeDeben total={total} clientes={conDeuda.length} />

      <AccionesMovimiento onAnotar={(tipo) => onAnotar(tipo)} />

      <div className="flex flex-col gap-2">
        {primero && (
          <Senalado si={destacarMarta}>
            <List label="Primer cliente de ejemplo">
              <FilaCliente cliente={primero} onClick={() => onAnotar('fiado', primero.id)} />
            </List>
          </Senalado>
        )}
        <List label="Clientes de ejemplo">
          {resto.map((c) => (
            <FilaCliente key={c.id} cliente={c} onClick={() => onAnotar('fiado', c.id)} />
          ))}
        </List>
      </div>
      <p className="m-0 text-body-s text-ink-muted">
        Son clientes de mentira. Tocá uno para anotarle un fiado.
      </p>
    </div>
  );
}

function AnotarPrueba({
  tipo,
  clientes,
  clienteId,
  monto,
  onMonto,
  onCliente,
  onVolver,
  onConfirmar,
  destacar: que,
}: {
  tipo: Tipo;
  clientes: readonly Cliente[];
  clienteId: number | null;
  monto: string;
  onMonto: (v: string) => void;
  onCliente: (id: number) => void;
  onVolver: () => void;
  onConfirmar: (clienteId: number, monto: number) => void;
  destacar: 'clientes' | 'teclado' | 'confirmar' | null;
}) {
  const valor = Number(monto) || 0;
  const color = tipo === 'fiado' ? 'text-fiado' : 'text-pago';
  const titulo = tipo === 'fiado' ? 'Anotar fiado' : 'Registrar pago';

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-6">
      <header className="flex items-center gap-2">
        <button type="button" aria-label="Volver" onClick={onVolver} className={BOTON_VOLVER}>
          <IconBack />
        </button>
        <h1 className={`m-0 font-display text-title-m ${color}`}>{titulo}</h1>
      </header>

      <Senalado si={que === 'clientes'} texto="Elegí uno">
      <fieldset className="m-0 p-0 border-0 flex flex-col gap-2">
        <legend className="mb-2 text-caption text-ink-muted">Cliente</legend>
        <div className="flex flex-wrap gap-2">
          {clientes.map((c) => (
            <Button
              key={c.id}
              type="button"
              size="chip"
              variant={c.id === clienteId ? 'primary' : 'soft'}
              aria-pressed={c.id === clienteId}
              onClick={() => onCliente(c.id)}
            >
              {c.nombre}
            </Button>
          ))}
        </div>
      </fieldset>
      </Senalado>

      <div className="text-center" aria-live="polite">
        <p className="m-0 text-caption text-ink-muted">¿Cuánto?</p>
        <p className={`m-0 font-display text-amount-l ${valor > 0 ? color : 'text-ink-disabled'}`}>
          {formatMoney(valor)}
        </p>
      </div>

      <Senalado si={que === 'teclado'} texto="Marcá el monto">
        <Keypad value={monto} onChange={onMonto} />
      </Senalado>

      <Senalado si={que === 'confirmar'}>
      <Button
        variant={tipo}
        size="l"
        block
        disabled={clienteId == null || valor <= 0}
        onClick={() => clienteId != null && onConfirmar(clienteId, valor)}
      >
        {titulo}
      </Button>
      </Senalado>
    </div>
  );
}

function ListoPrueba({
  tipo,
  monto,
  cliente,
  destacarEnviar,
  onEnviar,
  onSeguir,
}: {
  tipo: Tipo;
  monto: number;
  cliente: Cliente;
  destacarEnviar: boolean;
  onEnviar: () => void;
  onSeguir: () => void;
}) {
  const nombre = primerNombre(cliente.nombre);
  const texto = comprobante(tipo, monto, cliente, AJUSTES_PRUEBA);
  return (
    <div className="flex flex-col gap-5 px-4 py-8">
      <div className="flex flex-col items-center text-center gap-3">
        <span className="w-16 h-16 rounded-pill bg-ok-bg text-ok flex items-center justify-center">
          <IconCheck size={34} strokeWidth={2.6} />
        </span>
        <h1 className="m-0 font-display text-title-l text-ink">Listo</h1>
        <p className="m-0 text-body-l text-ink">
          {tipo === 'fiado'
            ? `Anotaste ${formatMoney(monto)} de fiado a ${nombre}.`
            : `${nombre} pagó ${formatMoney(monto)}.`}
        </p>
      </div>

      <Card>
        <p className="m-0 text-body text-ink-muted">
          {cliente.saldo < 0 ? 'Ahora te pagó de más' : 'Ahora te debe'}
        </p>
        <p className="m-0 font-display text-amount-m text-ink">{textoSaldo(cliente.saldo)}</p>
      </Card>

      <WhatsAppBubble label="Comprobante" text={texto} />
      <Senalado si={destacarEnviar}>
      <Button
        variant="whatsapp"
        size="l"
        block
        className="min-h-[58px]"
        onClick={() => {
          abrirWhatsApp(null, texto);
          onEnviar();
        }}
      >
        Enviar por WhatsApp
      </Button>
      </Senalado>
      <p className="m-0 -mt-3 text-caption text-ink-muted text-center">
        Como es una prueba, elegís a quién mandárselo (podés mandártelo a vos).
      </p>

      <Button variant="soft" size="m" block onClick={onSeguir}>
        Volver a la libreta
      </Button>
    </div>
  );
}
