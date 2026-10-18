import { FOCUS_RING } from '../../../host/ui/styles';
import type { PinPos } from '../geometry';
import type { TestNote } from '../types';

/** Pines numerados de las notas vivas de la pantalla, en coordenadas de la columna. */
export function Pins({
  pins,
  focusId,
  onOpen,
}: {
  pins: readonly { nota: TestNote; pos: PinPos }[];
  focusId: number | null;
  onOpen: (nota: TestNote) => void;
}) {
  return (
    <>
      {pins.map(({ nota, pos }) => (
        <button
          key={nota.id}
          type="button"
          title={`#${nota.id} · ${nota.texto}${
            pos.exacto ? '' : ' (el elemento ya no está: posición aproximada)'
          }`}
          aria-label={`Nota #${nota.id}${pos.exacto ? '' : ', posición aproximada'}`}
          onClick={() => onOpen(nota)}
          className={`pointer-events-auto absolute inline-flex h-7 min-w-[28px] items-center justify-center rounded-pill bg-ink px-1 text-micro font-bold text-surface ${
            pos.exacto ? '' : 'border border-dashed border-surface opacity-60'
          } ${focusId === nota.id ? 'outline outline-2 outline-danger' : ''} ${FOCUS_RING}`}
          style={{ top: pos.top, left: pos.left }}
        >
          {nota.id}
        </button>
      ))}
    </>
  );
}
