import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../host/ui/Button';
import { Keypad } from '../../../host/ui/Keypad';
import { formatMoney } from '../../../host/ui/format';
import { IconBack, IconCheck } from '../../../host/ui/icons';
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
const DESTACADO = 'outline outline-[3px] outline-fiado outline-offset-4 rounded-m';
const destacar = (si: boolean) => (si ? DESTACADO : '');

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
  const [guia, setGuia] = useState(true);
  const [enviado, setEnviado] = useState(false);
  const [monto, setMonto] = useState('');
  const arriba = useRef<HTMLDivElement>(null);

  // Cada paso es otra "pantalla": arranca desde arriba, con la guía a la vista.
  // biome-ignore lint/correctness/useExhaustiveDependencies: sólo al cambiar de pantalla
  useEffect(() => {
    arriba.current?.scrollIntoView?.({ block: 'start' });
  }, [paso.en]);

  const saltear = () => setGuia(false);
  const anotar = (tipo: Tipo, clienteId: number | null = null) => {
    setMonto('');
    setPaso({ en: 'anotar', tipo, clienteId });
  };

  let pantalla: ReactNode = null;
  if (paso.en === 'anotar') {
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
    pantalla = (
      <AnotarPrueba
        tipo={paso.tipo}
        clientes={clientes}
        clienteId={paso.clienteId}
        monto={monto}
        onMonto={setMonto}
        onCliente={(id) => setPaso({ ...paso, clienteId: id })}
        onVolver={() => setPaso({ en: 'inicio' })}
        guia={guiaAhora && <Guia n={guiaAhora.n} texto={guiaAhora.texto} onSaltear={saltear} />}
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
      pantalla = (
        <ListoPrueba
          tipo={paso.tipo}
          monto={paso.monto}
          cliente={cliente}
          guia={
            guiaAhora && (
              <Guia
                n={4}
                texto="Así le llega el comprobante a tu cliente. Tocá “Enviar por WhatsApp”."
                onSaltear={saltear}
              />
            )
          }
          destacarEnviar={guiaAhora}
          onEnviar={() => setEnviado(true)}
          onSeguir={() => setPaso({ en: 'inicio' })}
        />
      );
    }
  } else {
    pantalla = (
      <InicioPrueba
        clientes={clientes}
        onAnotar={anotar}
        destacarMarta={guia && !enviado}
        guia={
          !guia ? null : enviado ? (
            <GuiaFinal
              onCuenta={() => navigate('/sign-up')}
              onCerrar={saltear}
            />
          ) : (
            <Guia
              n={1}
              texto="Tocá a Marta Giménez para anotarle un fiado."
              onSaltear={saltear}
            />
          )
        }
      />
    );
  }

  return (
    <div ref={arriba} className="flex flex-col min-h-full">
      <BannerPrueba />
      {pantalla}
    </div>
  );
}

/** Fijo arriba: se está probando y nada se guarda. */
function BannerPrueba() {
  const navigate = useNavigate();
  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-ink text-surface">
      <p className="m-0 flex-1 text-body-s">
        Estás probando. Para guardar tus clientes, creá tu cuenta gratis.
      </p>
      <Button variant="on-dark" size="s" onClick={() => navigate('/sign-up')}>
        Crear cuenta
      </Button>
    </div>
  );
}

/** Cartel de la guía: en qué paso va y qué tocar. Se anuncia al cambiar. */
function Guia({ n, texto, onSaltear }: { n: number; texto: string; onSaltear: () => void }) {
  return (
    <section
      aria-label="Guía"
      aria-live="polite"
      className="flex flex-col gap-1 rounded-m border-2 border-fiado bg-surface px-4 py-3"
    >
      <p className="m-0 text-caption font-bold text-fiado">
        Paso {n} de {TOTAL_PASOS}
      </p>
      <p className="m-0 text-body text-ink">{texto}</p>
      <button
        type="button"
        onClick={onSaltear}
        className={`self-start min-h-touch text-body-s text-ink-muted underline ${FOCUS_RING}`}
      >
        Saltear la guía
      </button>
    </section>
  );
}

function GuiaFinal({ onCuenta, onCerrar }: { onCuenta: () => void; onCerrar: () => void }) {
  return (
    <section
      aria-label="Guía"
      aria-live="polite"
      className="flex flex-col gap-3 rounded-m border-2 border-fiado bg-surface px-4 py-3"
    >
      <p className="m-0 text-body text-ink">
        <strong>¡Ya sabés usarlo!</strong> Así de simple es anotar un fiado y mandarle el
        comprobante. Seguí probando con un pago, o creá tu cuenta para anotar a tus clientes.
      </p>
      <div className="flex gap-2">
        <Button variant="primary" size="m" onClick={onCuenta}>
          Crear mi cuenta
        </Button>
        <Button variant="soft" size="m" onClick={onCerrar}>
          Seguir probando
        </Button>
      </div>
    </section>
  );
}

function InicioPrueba({
  clientes,
  onAnotar,
  guia,
  destacarMarta,
}: {
  clientes: readonly Cliente[];
  onAnotar: (tipo: Tipo, clienteId?: number) => void;
  guia: ReactNode;
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

      {guia}

      <TarjetaTeDeben total={total} clientes={conDeuda.length} />

      <AccionesMovimiento onAnotar={(tipo) => onAnotar(tipo)} />

      <div className="flex flex-col gap-2">
        {primero && (
          <div className={destacar(destacarMarta)}>
            <List label="Primer cliente de ejemplo">
              <FilaCliente cliente={primero} onClick={() => onAnotar('fiado', primero.id)} />
            </List>
          </div>
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
  guia,
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
  guia: ReactNode;
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

      {guia}

      <fieldset
        className={`m-0 p-0 border-0 flex flex-col gap-2 ${destacar(que === 'clientes')}`}
      >
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

      <div className="text-center" aria-live="polite">
        <p className="m-0 text-caption text-ink-muted">Monto</p>
        <p className={`m-0 font-display text-amount-l ${valor > 0 ? color : 'text-ink-disabled'}`}>
          {formatMoney(valor)}
        </p>
      </div>

      <div className={destacar(que === 'teclado')}>
        <Keypad value={monto} onChange={onMonto} />
      </div>

      <Button
        variant={tipo}
        size="l"
        block
        className={destacar(que === 'confirmar')}
        disabled={clienteId == null || valor <= 0}
        onClick={() => clienteId != null && onConfirmar(clienteId, valor)}
      >
        {titulo}
      </Button>
    </div>
  );
}

function ListoPrueba({
  tipo,
  monto,
  cliente,
  guia,
  destacarEnviar,
  onEnviar,
  onSeguir,
}: {
  tipo: Tipo;
  monto: number;
  cliente: Cliente;
  guia: ReactNode;
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
          {cliente.saldo < 0 ? 'Ahora tiene a favor' : 'Ahora te debe'}
        </p>
        <p className="m-0 font-display text-amount-m text-ink">{textoSaldo(cliente.saldo)}</p>
      </Card>

      {guia}

      <WhatsAppBubble label="Comprobante" text={texto} />
      <Button
        variant="whatsapp"
        size="l"
        block
        className={`min-h-[58px] ${destacar(destacarEnviar)}`}
        onClick={() => {
          abrirWhatsApp(null, texto);
          onEnviar();
        }}
      >
        Enviar por WhatsApp
      </Button>
      <p className="m-0 -mt-3 text-caption text-ink-muted text-center">
        Como es una prueba, elegís a quién mandárselo (podés mandártelo a vos).
      </p>

      <Button variant="soft" size="m" block onClick={onSeguir}>
        Volver a la libreta
      </Button>
    </div>
  );
}
