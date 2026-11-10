import { SignedIn, SignedOut } from '@clerk/clerk-react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../../host/ui/Button';
import { IconChevron, IconClose } from '../../../host/ui/icons';
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
  'El cuaderno se pierde.',
  'Te da vergüenza cobrar.',
  'No sabés cuánto te deben.',
] as const;

const PASOS = [
  { titulo: 'Anotá', texto: 'Elegís el cliente y el monto.' },
  { titulo: 'Avisale', texto: 'Le llega el detalle por WhatsApp.' },
  { titulo: 'Cobrá', texto: 'La app te dice a quién cobrarle.' },
] as const;

const PREGUNTAS = [
  { p: '¿Cuánto cuesta?', r: 'Nada. Es gratis.' },
  { p: '¿Mi cliente tiene que bajar algo?', r: 'No. Le llega por WhatsApp.' },
  { p: '¿Y si pierdo el celu?', r: 'No perdés nada. Entrás desde otro celu y está todo.' },
  { p: '¿Y si me equivoco?', r: 'Lo corregís en un momento.' },
] as const;

/**
 * Home pública de Fiado (plan de adopción, fase 2, punto 5): sin sesión,
 * `/fiado` cuenta qué es y empuja a probarla sin registrarse o a crear la
 * cuenta, en lugar de mandar al login. Textos cortos para alguien con poca
 * experiencia con apps (guía, "Usuario"). Plana como el resto de la app (sin
 * sombras ni degradados, guía §1); sin barra inferior (`chromeSignedOut: 'task'`).
 */
export function Landing() {
  const navigate = useNavigate();
  const probar = () => navigate(RUTAS.probar);
  const registrarse = () => navigate(SIGN_UP);

  return (
    <div className="flex flex-col">
      <header className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
        <span className="font-display text-title-s text-ink">
          Neggo <span className="text-fiado">Fiado</span>
        </span>
        <Button variant="soft" size="s" onClick={() => navigate(SIGN_IN)}>
          Ya tengo cuenta
        </Button>
      </header>

      {/* Hero */}
      <section className="flex flex-col gap-5 px-4 pt-6 pb-8">
        <span className="self-start rounded-pill bg-ok-bg text-ok px-3 py-1 text-caption font-bold">
          Gratis
        </span>
        <h1 className="m-0 font-display text-amount-m text-ink">
          El fiado, <span className="text-fiado">sin cuaderno</span> y sin quedar mal.
        </h1>
        <p className="m-0 text-body-l text-ink-muted">
          Anotá en el celu lo que te deben. Tu cliente recibe el detalle por WhatsApp.
        </p>
        <div className="flex flex-col gap-2">
          <Button variant="fiado" size="xl" block onClick={probar}>
            Probala ahora
          </Button>
          <Button variant="outline" size="l" block onClick={registrarse}>
            Registrarme gratis
          </Button>
        </div>
        <p className="m-0 text-caption text-ink-muted text-center">
          Para probarla no te pedimos nada. Tarda un minuto.
        </p>
      </section>

      {/* El chat que recibe el cliente */}
      <section aria-label="Así le llega a tu cliente" className="px-4 pb-10">
        <TelefonoChat />
      </section>

      {/* El problema */}
      <section className="flex flex-col gap-4 px-4 pb-10">
        <h2 className="m-0 font-display text-title-l text-ink">¿Te pasa?</h2>
        <ul className="m-0 p-0 list-none flex flex-col gap-2">
          {DOLORES.map((d) => (
            <li key={d} className="flex items-center gap-3 rounded-l bg-surface px-4 py-3">
              <span
                aria-hidden="true"
                className="flex-none w-7 h-7 rounded-pill bg-late-bg text-late inline-flex items-center justify-center"
              >
                <IconClose size={16} />
              </span>
              <span className="text-body-l text-ink">{d}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Cómo funciona */}
      <section className="flex flex-col gap-4 px-4 pb-10">
        <h2 className="m-0 font-display text-title-l text-ink">Así de simple</h2>
        <ol className="m-0 p-0 list-none flex flex-col gap-4">
          {PASOS.map((p, i) => (
            <li key={p.titulo} className="flex items-center gap-4">
              <span
                aria-hidden="true"
                className="flex-none w-10 h-10 rounded-pill bg-fiado text-surface font-display text-title-s inline-flex items-center justify-center"
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="m-0 text-body-l font-bold text-ink">{p.titulo}</p>
                <p className="m-0 text-body text-ink-muted">{p.texto}</p>
              </div>
            </li>
          ))}
        </ol>
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
          <h2 className="m-0 font-display text-title-l text-surface">Pasá el cuaderno al celu.</h2>
          <p className="m-0 mt-2 mb-5 text-body text-on-dark-body">
            Probala primero. Si te gusta, te registrás gratis.
          </p>
          <div className="flex flex-col gap-2">
            <Button variant="fiado" size="l" block onClick={probar}>
              Probala ahora
            </Button>
            <Button variant="on-dark" size="l" block onClick={registrarse}>
              Registrarme gratis
            </Button>
          </div>
        </Card>
      </section>

      <footer className="flex flex-col items-center gap-2 px-4 pb-10 text-center">
        <p className="m-0 text-body-s text-ink-muted">
          Tus datos son tuyos. No los vendemos ni los compartimos.
        </p>
        <nav aria-label="Legales" className="flex gap-4">
          <Link to="/privacidad" className={`text-body-s text-ink underline ${FOCUS_RING}`}>
            Privacidad
          </Link>
          <Link to="/terminos" className={`text-body-s text-ink underline ${FOCUS_RING}`}>
            Términos
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
