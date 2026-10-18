import { Button } from '../ui/Button';
import { IconClose } from '../ui/icons';
import { FOCUS_RING } from '../ui/styles';
import { Card } from '../ui/surfaces';
import { instalarApp, marcarInstalada, ocultarTarjetaInstalar, useInstalar } from './instalar';

/** Ícono "Compartir" de Safari (cuadrado con flecha), para reconocerlo en pantalla. */
function IconCompartir() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="inline-block align-[-3px]"
    >
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M7 10H5v11h14V10h-2" />
    </svg>
  );
}

/** Contenido común: Android abre el cartel de Chrome; iPhone muestra los pasos. */
function Cuerpo({ modo }: { modo: 'android' | 'ios' }) {
  if (modo === 'android') {
    return (
      <>
        <p className="m-0 mb-4 text-body-s text-ink-muted">
          Tenela en la pantalla de inicio y abrila con un toque, como cualquier app.
        </p>
        <Button variant="primary" size="m" block onClick={() => void instalarApp()}>
          Instalar
        </Button>
      </>
    );
  }
  return (
    <>
      <ol className="m-0 mb-4 pl-5 text-body-s text-ink-muted flex flex-col gap-1">
        <li>
          Tocá <strong className="text-ink">Compartir</strong> <IconCompartir /> abajo en Safari.
        </li>
        <li>
          Elegí <strong className="text-ink">Agregar a inicio</strong>.
        </li>
      </ol>
      <Button variant="soft" size="s" block onClick={marcarInstalada}>
        Ya la agregué
      </Button>
    </>
  );
}

/** Tarjeta de Inicio, con ✕ para no volver a verla (la opción sigue en "Más"). */
export function TarjetaInstalar() {
  const { modo, tarjetaOculta } = useInstalar();
  if (!modo || tarjetaOculta) return null;
  return (
    <Card>
      <div className="mb-1 flex items-start justify-between gap-3">
        <p className="m-0 font-display text-title-s text-ink">Instalá Neggo en tu celu</p>
        <button
          type="button"
          onClick={ocultarTarjetaInstalar}
          aria-label="No mostrar más"
          className={`pressable -mr-2 -mt-2 flex-none inline-flex items-center justify-center min-h-touch min-w-touch rounded-pill text-ink-muted ${FOCUS_RING}`}
        >
          <IconClose size={20} />
        </button>
      </div>
      <Cuerpo modo={modo} />
    </Card>
  );
}

/** Opción fija en "Más" mientras la app no esté instalada. */
export function OpcionInstalar() {
  const { modo } = useInstalar();
  if (!modo) return null;
  return (
    <Card>
      <p className="m-0 mb-1 font-display text-title-s text-ink">Instalar la app</p>
      <Cuerpo modo={modo} />
    </Card>
  );
}
