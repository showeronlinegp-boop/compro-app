import { SignedIn, SignedOut } from '@clerk/clerk-react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../../host/ui/Button';
import {
  IconBell,
  IconCheck,
  IconChevron,
  IconClients,
  IconClose,
  IconList,
  IconMessage,
} from '../../../host/ui/icons';
import { FOCUS_RING } from '../../../host/ui/styles';
import { Card } from '../../../host/ui/surfaces';
import { comprobante, recordatorio } from '../mensajes';
import { AJUSTES_PRUEBA, clienteDePrueba } from '../prueba';
import { RUTAS } from '../rutas';
import Inicio from './Inicio';

const SIGN_IN = '/sign-in';
const SIGN_UP = '/sign-up';

/** El chat de ejemplo: un fiado de $ 3.500 a Marta y, días después, el recordatorio. */
const MARTA = clienteDePrueba(1, 'Marta Giménez', 12300, 0);
const CHAT_FIADO = comprobante('fiado', 3500, MARTA, AJUSTES_PRUEBA);
const CHAT_RECORDATORIO = recordatorio(MARTA, AJUSTES_PRUEBA);

const DOLORES = [
  'El cuaderno se moja, se pierde o no se entiende la letra.',
  'Te da vergüenza cobrar y el cliente “se olvida”.',
  'No sabés bien cuánto te deben ni desde cuándo.',
] as const;

const PASOS = [
  { titulo: 'Anotá lo que se lleva', texto: 'Elegís el cliente, marcás el monto y listo.' },
  { titulo: 'Mandale el comprobante', texto: 'Le llega por WhatsApp con su saldo al día.' },
  {
    titulo: 'Cobrá sin quedar mal',
    texto: 'La app te dice a quién cobrarle y le recordás con un toque.',
  },
] as const;

const FUNCIONES: readonly { icono: ReactNode; titulo: string; texto: string }[] = [
  {
    icono: <IconMessage />,
    titulo: 'Comprobante por WhatsApp',
    texto: 'Cada fiado y cada pago, con el saldo. Sin discusiones.',
  },
  {
    icono: <IconBell />,
    titulo: 'Avisos de cobro',
    texto: 'Ves quién tiene que pagar hoy y quién se viene atrasando.',
  },
  {
    icono: <IconList />,
    titulo: 'Historial que no se borra',
    texto: 'Si te equivocás, lo corregís y queda anotado.',
  },
  {
    icono: <IconClients />,
    titulo: 'Tus clientes, ordenados',
    texto: 'Los cargás desde tus contactos y sabés cuánto debe cada uno.',
  },
];

const PREGUNTAS = [
  {
    p: '¿Cuánto cuesta?',
    r: 'Nada. Neggo Fiado es gratis: creás tu cuenta y empezás a anotar.',
  },
  {
    p: '¿Mi cliente tiene que instalar algo?',
    r: 'No. El comprobante le llega por WhatsApp, como cualquier mensaje.',
  },
  {
    p: '¿Funciona en mi celular?',
    r: 'Sí, desde el navegador del celu. Si querés, la instalás como una app.',
  },
  {
    p: '¿Qué pasa si anoto mal?',
    r: 'Lo deshacés al toque. La corrección queda en el historial, así nadie duda.',
  },
] as const;

/**
 * Home pública de Fiado (plan de adopción, fase 2, punto 5): sin sesión,
 * `/fiado` cuenta qué es y empuja a probarla sin cuenta o a registrarse, en
 * lugar de mandar al login. Plana como el resto de la app (sin sombras ni
 * degradados, guía §1); sin barra inferior (`chromeSignedOut: 'task'`).
 */
export function Landing() {
  const navigate = useNavigate();
  const probar = () => navigate(RUTAS.probar);
  const registrarse = () => navigate(SIGN_UP);

  return (
    <div className="flex flex-col">
      {/* Barra superior */}
      <header className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
        <span className="font-display text-title-s text-ink">
          Neggo <span className="text-fiado">Fiado</span>
        </span>
        <Button variant="soft" size="s" onClick={() => navigate(SIGN_IN)}>
          Ingresar
        </Button>
      </header>

      {/* Hero */}
      <section className="flex flex-col gap-5 px-4 pt-6 pb-8">
        <span className="self-start rounded-pill bg-ok-bg text-ok px-3 py-1 text-caption font-bold">
          Gratis · Sin tarjeta · Sin instalar nada
        </span>
        <h1 className="m-0 font-display text-amount-m text-ink">
          El fiado, <span className="text-fiado">sin cuaderno</span> y sin quedar mal.
        </h1>
        <p className="m-0 text-body-l text-ink-muted">
          Anotá lo que te deben en el celu y mandale a cada cliente su cuenta por WhatsApp. Cobrás
          más y discutís menos.
        </p>
        <div className="flex flex-col gap-2">
          <Button variant="fiado" size="xl" block onClick={probar}>
            Probala ahora, sin cuenta
          </Button>
          <Button variant="outline" size="l" block onClick={registrarse}>
            Crear mi cuenta gratis
          </Button>
        </div>
        <p className="m-0 text-caption text-ink-muted text-center">
          La prueba tarda un minuto y no te pide ningún dato.
        </p>
      </section>

      {/* El chat que recibe el cliente */}
      <section aria-label="Así le llega a tu cliente" className="px-4 pb-10">
        <TelefonoChat />
      </section>

      {/* El problema */}
      <section className="flex flex-col gap-4 px-4 pb-10">
        <h2 className="m-0 font-display text-title-l text-ink">¿Te suena?</h2>
        <ul className="m-0 p-0 list-none flex flex-col gap-2">
          {DOLORES.map((d) => (
            <li key={d} className="flex items-start gap-3 rounded-l bg-surface px-4 py-3">
              <span
                aria-hidden="true"
                className="flex-none mt-[2px] w-7 h-7 rounded-pill bg-late-bg text-late inline-flex items-center justify-center"
              >
                <IconClose size={16} />
              </span>
              <span className="text-body text-ink">{d}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* La solución */}
      <section className="px-4 pb-10">
        <Card tone="dark">
          <p className="m-0 text-micro uppercase tracking-[1px] text-on-dark-muted">
            Con Neggo Fiado
          </p>
          <p className="m-0 mt-3 text-body text-on-dark-body">Te deben</p>
          <p className="m-0 font-display text-amount-xl text-surface">$ 19.600</p>
          <p className="m-0 text-body-s text-on-dark-muted">entre 3 clientes · al día de hoy</p>
          <ul className="m-0 mt-5 p-0 list-none flex flex-col gap-3">
            {[
              'Sabés al toque cuánto te debe cada uno.',
              'Le mandás el comprobante en un toque.',
              'Te avisa a quién cobrarle hoy.',
            ].map((t) => (
              <li key={t} className="flex items-start gap-3 text-body text-surface">
                <span
                  aria-hidden="true"
                  className="flex-none w-6 h-6 rounded-pill bg-ok text-surface inline-flex items-center justify-center"
                >
                  <IconCheck size={14} strokeWidth={3} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {/* Cómo funciona */}
      <section className="flex flex-col gap-4 px-4 pb-10">
        <h2 className="m-0 font-display text-title-l text-ink">Así de simple</h2>
        <ol className="m-0 p-0 list-none flex flex-col gap-4">
          {PASOS.map((p, i) => (
            <li key={p.titulo} className="flex gap-4">
              <span
                aria-hidden="true"
                className="flex-none w-10 h-10 rounded-pill bg-fiado text-surface font-display text-title-s inline-flex items-center justify-center"
              >
                {i + 1}
              </span>
              <div className="min-w-0 pt-1">
                <p className="m-0 text-body-l font-bold text-ink">{p.titulo}</p>
                <p className="m-0 text-body text-ink-muted">{p.texto}</p>
              </div>
            </li>
          ))}
        </ol>
        <Button variant="primary" size="l" block onClick={probar}>
          Probalo con clientes de ejemplo
        </Button>
      </section>

      {/* Funciones */}
      <section className="flex flex-col gap-4 px-4 pb-10">
        <h2 className="m-0 font-display text-title-l text-ink">Todo lo que necesitás</h2>
        <div className="grid grid-cols-2 gap-2">
          {FUNCIONES.map((f) => (
            <div key={f.titulo} className="flex flex-col gap-2 rounded-l bg-surface p-4">
              <span
                aria-hidden="true"
                className="w-10 h-10 rounded-m bg-bg text-fiado inline-flex items-center justify-center"
              >
                {f.icono}
              </span>
              <h3 className="m-0 text-body font-bold text-ink">{f.titulo}</h3>
              <p className="m-0 text-caption text-ink-muted">{f.texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Preguntas */}
      <section className="flex flex-col gap-4 px-4 pb-10">
        <h2 className="m-0 font-display text-title-l text-ink">Preguntas frecuentes</h2>
        <div className="flex flex-col gap-2">
          {PREGUNTAS.map(({ p, r }) => (
            <details key={p} className="group rounded-l bg-surface">
              <summary
                className={`flex items-center justify-between gap-3 min-h-touch px-4 py-3 cursor-pointer list-none text-body font-bold text-ink rounded-l ${FOCUS_RING}`}
              >
                {p}
                <span aria-hidden="true" className="flex-none transition-transform group-open:rotate-90">
                  <IconChevron size={20} />
                </span>
              </summary>
              <p className="m-0 px-4 pb-4 text-body text-ink-muted">{r}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Cierre */}
      <section className="px-4 pb-8">
        <Card tone="dark">
          <h2 className="m-0 font-display text-title-l text-surface">Dejá el cuaderno hoy.</h2>
          <p className="m-0 mt-2 mb-5 text-body text-on-dark-body">
            Probala con clientes de ejemplo, y cuando te convenza, creá tu cuenta gratis.
          </p>
          <div className="flex flex-col gap-2">
            <Button variant="fiado" size="l" block onClick={probar}>
              Probala ahora, sin cuenta
            </Button>
            <Button variant="on-dark" size="l" block onClick={registrarse}>
              Crear mi cuenta gratis
            </Button>
          </div>
        </Card>
      </section>

      <footer className="flex flex-col items-center gap-2 px-4 pb-10 text-center">
        <p className="m-0 text-body-s text-ink-muted">
          Tus clientes y tus montos son tuyos: no los vendemos ni los compartimos.
        </p>
        <nav aria-label="Legales" className="flex gap-4">
          <Link to="/privacidad" className={`text-body-s text-ink underline ${FOCUS_RING}`}>
            Privacidad
          </Link>
          <Link to="/terminos" className={`text-body-s text-ink underline ${FOCUS_RING}`}>
            Términos
          </Link>
          <Link to={SIGN_IN} className={`text-body-s text-ink underline ${FOCUS_RING}`}>
            Ya tengo cuenta
          </Link>
        </nav>
      </footer>
    </div>
  );
}

/** Un celular plano con el chat de WhatsApp del cliente: el comprobante y el recordatorio. */
function TelefonoChat() {
  return (
    <figure className="m-0 mx-auto w-full max-w-[340px] rounded-[32px] border-[6px] border-ink bg-ink overflow-hidden">
      <div className="flex items-center gap-3 bg-whatsapp px-4 py-3 text-surface">
        <span
          aria-hidden="true"
          className="flex-none w-9 h-9 rounded-pill bg-surface text-whatsapp font-bold inline-flex items-center justify-center"
        >
          K
        </span>
        <div className="min-w-0">
          <p className="m-0 text-body font-bold">{AJUSTES_PRUEBA.comercio}</p>
          <p className="m-0 text-micro">en línea</p>
        </div>
      </div>
      <div className="flex flex-col gap-3 bg-bg px-3 py-4">
        <Burbuja de="comercio" hora="18:42">
          {CHAT_FIADO}
        </Burbuja>
        <Burbuja de="cliente" hora="18:45">
          ¡Gracias! El viernes te paso.
        </Burbuja>
        <p className="m-0 self-center rounded-pill bg-surface px-3 py-1 text-micro text-ink-muted">
          Viernes
        </p>
        <Burbuja de="comercio" hora="10:05">
          {CHAT_RECORDATORIO}
        </Burbuja>
      </div>
      <figcaption className="bg-ink px-4 py-3 text-center text-caption text-on-dark-body">
        Así le llega a tu cliente
      </figcaption>
    </figure>
  );
}

function Burbuja({
  de,
  hora,
  children,
}: {
  de: 'comercio' | 'cliente';
  hora: string;
  children: ReactNode;
}) {
  const delCliente = de === 'cliente';
  return (
    <div
      className={`max-w-[85%] px-3 pt-2 pb-1 text-body-s text-ink whitespace-pre-line ${
        delCliente
          ? 'self-end bg-whatsapp-bubble rounded-[14px_14px_4px_14px]'
          : 'self-start bg-surface rounded-[14px_14px_14px_4px]'
      }`}
    >
      {children}
      <span className="block text-right text-micro text-ink-muted">{hora}</span>
    </div>
  );
}

/** `/fiado`: el Inicio con sesión, la home pública sin sesión. */
export default function InicioOPublica() {
  return (
    <>
      <SignedIn>
        <Inicio />
      </SignedIn>
      <SignedOut>
        <Landing />
      </SignedOut>
    </>
  );
}
