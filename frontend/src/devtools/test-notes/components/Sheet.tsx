import type { ReactNode } from 'react';
import { IconClose } from '../../../host/ui/icons';
import { FOCUS_RING } from '../../../host/ui/styles';

/** Hoja inferior de ancho completo dentro de la columna (guía §3: sin drawers laterales). */
export function Sheet({
  subtitulo,
  onClose,
  children,
}: {
  subtitulo: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <section
      aria-label="Notas de prueba"
      className="pointer-events-auto absolute inset-x-0 bottom-0 flex max-h-[85%] flex-col rounded-t-xl border-t border-line bg-surface"
    >
      <header className="flex flex-none items-center gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 font-display text-title-s text-ink">Notas de prueba</h2>
          <p className="m-0 truncate text-caption text-ink-muted">{subtitulo}</p>
        </div>
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
          className={`inline-flex min-h-touch min-w-touch items-center justify-center rounded-m text-ink-muted ${FOCUS_RING}`}
        >
          <IconClose size={22} />
        </button>
      </header>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">{children}</div>
    </section>
  );
}
