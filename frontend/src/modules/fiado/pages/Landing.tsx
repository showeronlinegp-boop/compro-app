import { SignedIn, SignedOut } from '@clerk/clerk-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../../host/ui/Button';
import { FOCUS_RING } from '../../../host/ui/styles';
import { Card, WhatsAppBubble } from '../../../host/ui/surfaces';
import { comprobante } from '../mensajes';
import { AJUSTES_PRUEBA, clienteDePrueba } from '../prueba';
import { RUTAS } from '../rutas';
import Inicio from './Inicio';

const PASOS = [
  { titulo: 'Anotá lo que te fían', texto: 'Elegís el cliente, ponés el monto y listo.' },
  {
    titulo: 'Mandale el comprobante',
    texto: 'Le llega por WhatsApp con su saldo. Sin cuentas raras.',
  },
  {
    titulo: 'Cobrá sin quedar mal',
    texto: 'Ves quién te debe hace más tiempo y le recordás con un toque.',
  },
] as const;

/** El mensaje de ejemplo: un fiado de $ 3.500 a Marta, que ya debía $ 8.800. */
const EJEMPLO = comprobante(
  'fiado',
  3500,
  clienteDePrueba(1, 'Marta Giménez', 12300, 0),
  AJUSTES_PRUEBA,
);

/**
 * Página pública de Fiado (plan de adopción, fase 2, punto 5): sin sesión,
 * `/fiado` muestra qué es en lugar de mandar al login, con "Probar sin cuenta"
 * y "Empezar gratis". Sin barra inferior (`chromeSignedOut: 'task'`).
 */
export function Landing() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-6 px-4 pt-6 pb-8">
      <header className="flex items-center justify-between gap-3">
        <span className="font-display text-title-s text-ink">Neggo Fiado</span>
        <Link
          to="/sign-in"
          className={`min-h-touch inline-flex items-center px-2 text-body font-bold text-ink underline ${FOCUS_RING}`}
        >
          Ya tengo cuenta
        </Link>
      </header>

      <section className="flex flex-col gap-3">
        <h1 className="m-0 font-display text-title-l text-ink">
          Mandale a tu cliente lo que te debe por WhatsApp, sin quedar mal.
        </h1>
        <p className="m-0 text-body-l text-ink-muted">
          La libreta de fiado del almacén, en el celu. Gratis.
        </p>
      </section>

      <WhatsAppBubble label="Así le llega a tu cliente" text={EJEMPLO} />

      <div className="flex flex-col gap-2">
        <Button variant="primary" size="l" block onClick={() => navigate(RUTAS.probar)}>
          Probar sin cuenta
        </Button>
        <Button variant="outline" size="l" block onClick={() => navigate('/sign-up')}>
          Empezar gratis
        </Button>
      </div>

      <Card>
        <ol className="m-0 p-0 list-none flex flex-col gap-4">
          {PASOS.map((p, i) => (
            <li key={p.titulo} className="flex gap-3">
              <span
                aria-hidden="true"
                className="flex-none w-8 h-8 rounded-pill bg-ink text-surface font-bold inline-flex items-center justify-center"
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="m-0 text-body font-bold text-ink">{p.titulo}</p>
                <p className="m-0 text-body-s text-ink-muted">{p.texto}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <p className="m-0 text-body-s text-ink-muted text-center">
        Tus datos son tuyos. En Neggo no vemos tus clientes ni tus montos.{' '}
        <Link to="/privacidad" className={`text-ink underline ${FOCUS_RING}`}>
          Privacidad
        </Link>
      </p>
    </div>
  );
}

/** `/fiado`: el Inicio con sesión, la página pública sin sesión. */
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
