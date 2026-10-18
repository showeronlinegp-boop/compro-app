import { FOCUS_RING } from '../../../host/ui/styles';

/** Botones flotantes "Marcar" y "Notas", por encima de la barra y de los toasts. */
export function Fabs({
  bottom,
  pendientesRuta,
  onMarcar,
  onNotas,
}: {
  bottom: number;
  pendientesRuta: number;
  onMarcar: () => void;
  onNotas: () => void;
}) {
  const fab = `pressable pointer-events-auto inline-flex min-h-touch items-center gap-2 rounded-pill px-4 font-display text-button-m ${FOCUS_RING}`;
  return (
    <div className="absolute right-4 flex gap-2" style={{ bottom }}>
      <button
        type="button"
        onClick={onMarcar}
        title="Marcar un problema en esta pantalla"
        className={`${fab} bg-ink text-surface`}
      >
        Marcar
      </button>
      <button
        type="button"
        onClick={onNotas}
        title="Ver notas de prueba"
        className={`${fab} border border-border bg-surface text-ink`}
      >
        Notas
        <span
          className={`inline-flex h-6 min-w-[24px] items-center justify-center rounded-pill px-1 text-micro ${
            pendientesRuta ? 'bg-danger text-surface' : 'bg-surface-muted text-ink-muted'
          }`}
        >
          {pendientesRuta}
        </span>
      </button>
    </div>
  );
}
