import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Dock as DockFrame } from '../geometry';

/**
 * Panel lateral FUERA de la app (portal a `body`, `fixed`), en el espacio libre a
 * la derecha de la columna: siempre visible y sin tapar lo que se prueba. Lleva
 * `data-test-notes`, así el modo marcar lo ignora.
 */
export function Dock({
  frame,
  subtitulo,
  children,
}: {
  frame: DockFrame;
  subtitulo: string;
  children: ReactNode;
}) {
  return createPortal(
    <section
      data-test-notes=""
      aria-label="Notas de prueba"
      className="fixed bottom-4 top-4 z-[60] flex flex-col overflow-hidden rounded-l border border-line bg-surface font-body text-body text-ink"
      style={{ left: frame.left, width: frame.width }}
    >
      <header className="flex-none border-b border-line px-4 py-3">
        <h2 className="m-0 font-display text-title-s text-ink">Notas de prueba</h2>
        <p className="m-0 truncate text-caption text-ink-muted">{subtitulo}</p>
      </header>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">{children}</div>
    </section>,
    document.body,
  );
}
