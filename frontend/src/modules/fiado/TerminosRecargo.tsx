import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../host/ui/Button';
import { FOCUS_RING } from '../../host/ui/styles';

/** La sección de recargos de los Términos y condiciones (página pública). */
export const TERMINOS_RECARGO_URL = '/terminos#recargos';

const PUNTOS = [
  'Las condiciones las fijás vos y sos responsable de que sean legales y razonables.',
  'Antes de cobrarle un recargo a un cliente tenés que informarle las condiciones. Neggo no verifica que las haya recibido.',
  'Los recargos son sugerencias: revisá cada uno antes de sumarlo. No es asesoramiento legal ni contable.',
  'Neggo no responde por reclamos de tus clientes por los recargos que cobres.',
];

/**
 * Diálogo que hay que aceptar para activar el recargo por atraso: resume los
 * términos, enlaza el texto completo y sólo deja seguir con la casilla
 * marcada. La aceptación se registra en el backend al guardar Ajustes.
 */
export function DialogoTerminosRecargo({
  onAceptar,
  onCancelar,
}: {
  onAceptar: () => void;
  onCancelar: () => void;
}) {
  const [acepto, setAcepto] = useState(false);
  const titulo = useId();
  const caja = useRef<HTMLDialogElement>(null);
  const cancelar = useRef(onCancelar);
  cancelar.current = onCancelar;

  // Foco adentro al abrir y Escape para cerrar; el fondo no scrollea mientras está abierto.
  useEffect(() => {
    caja.current?.focus();
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancelar.current();
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previo;
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-scrim p-4">
      {/* `open` sin showModal(): el fondo y el foco los maneja este componente. */}
      <dialog
        open
        ref={caja}
        aria-modal="true"
        aria-labelledby={titulo}
        tabIndex={-1}
        className="relative m-0 flex max-h-full w-full max-w-[480px] flex-col gap-4 overflow-y-auto rounded-l border-0 bg-surface p-5 text-ink outline-none"
      >
        <h2 id={titulo} className="m-0 font-display text-title-s text-ink">
          Antes de activar los recargos
        </h2>
        <p className="m-0 text-body text-ink">
          Neggo calcula y te sugiere los recargos. Vos decidís si los cobrás. Al activarlos aceptás
          que:
        </p>
        <ul className="m-0 flex list-disc flex-col gap-2 pl-5 text-body-s text-ink">
          {PUNTOS.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <a
          className={`self-start text-body-s font-bold text-pago underline ${FOCUS_RING}`}
          href={TERMINOS_RECARGO_URL}
          target="_blank"
          rel="noreferrer"
        >
          Leer los términos completos
        </a>
        <label className="flex min-h-touch cursor-pointer items-start gap-3 text-body-s text-ink">
          <input
            type="checkbox"
            className="mt-[2px] h-5 w-5 flex-none accent-ink"
            checked={acepto}
            onChange={(e) => setAcepto(e.target.checked)}
          />
          <span>Leí y acepto los Términos y condiciones del recargo por atraso.</span>
        </label>
        <div className="flex flex-col gap-2">
          <Button variant="primary" size="m" block disabled={!acepto} onClick={onAceptar}>
            Aceptar y activar
          </Button>
          <Button variant="soft" size="m" block onClick={onCancelar}>
            Cancelar
          </Button>
        </div>
      </dialog>
    </div>
  );
}
