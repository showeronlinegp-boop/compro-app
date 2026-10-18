import type { MouseEvent, PointerEvent } from 'react';
import { FOCUS_RING } from '../../../host/ui/styles';

/** Rect en coordenadas de la columna. */
export interface LocalRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Capa del modo marcar: cubre toda la columna, intercepta puntero y clic (la app
 * de abajo no reacciona) y resalta el elemento bajo el puntero.
 */
export function MarkLayer({
  hover,
  onMove,
  onPick,
  onCancel,
  banner = true,
}: {
  hover: LocalRect | null;
  onMove: (e: PointerEvent<HTMLDivElement>) => void;
  onPick: (e: MouseEvent<HTMLDivElement>) => void;
  onCancel: () => void;
  /** Sin panel lateral, el cartel va sobre la app. */
  banner?: boolean;
}) {
  return (
    <div
      data-testid="test-notes-mark-layer"
      className="pointer-events-auto absolute inset-0 cursor-crosshair"
      onPointerMove={onMove}
      onClick={onPick}
    >
      {hover && (
        <div
          className="pointer-events-none absolute rounded-sm outline outline-2 outline-focus"
          style={hover}
        />
      )}
      {banner && <MarkBanner className="absolute inset-x-4 top-3" onCancel={onCancel} />}
    </div>
  );
}

/** "Tocá donde está el problema" + Cancelar: sobre la app o, con panel lateral, en el panel. */
export function MarkBanner({ className = '', onCancel }: { className?: string; onCancel: () => void }) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-pill bg-ink px-4 py-2 text-caption text-surface ${className}`}
    >
      <span>Tocá donde está el problema</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onCancel();
        }}
        className={`min-h-[36px] rounded-m border border-on-dark-muted px-3 text-caption text-surface ${FOCUS_RING}`}
      >
        Cancelar (Esc)
      </button>
    </div>
  );
}
