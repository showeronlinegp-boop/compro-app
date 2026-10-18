import type { ReactNode } from 'react';
import { FOCUS_RING } from '../../../host/ui/styles';

export type MiniTone = 'ink' | 'ok' | 'danger' | 'muted';

const SOLID: Record<MiniTone, string> = {
  ink: 'bg-ink text-surface border-ink',
  ok: 'bg-ok text-surface border-ok',
  danger: 'bg-danger text-surface border-danger',
  muted: 'bg-surface-muted text-ink border-border',
};

const OUTLINE: Record<MiniTone, string> = {
  ink: 'bg-surface text-ink border-ink',
  ok: 'bg-surface text-ok border-ok',
  danger: 'bg-surface text-danger border-danger',
  muted: 'bg-surface text-ink-muted border-border',
};

/** Botón chico de las tarjetas (alto táctil de 40 px). */
export function MiniButton({
  tone,
  solid = false,
  onClick,
  children,
}: {
  tone: MiniTone;
  solid?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pressable min-h-[40px] rounded-m border px-3 text-caption font-bold ${
        solid ? SOLID[tone] : OUTLINE[tone]
      } ${FOCUS_RING}`}
    >
      {children}
    </button>
  );
}
