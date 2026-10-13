import type { ReactNode } from 'react';

interface TwoColumnProps {
  /** Content rendered in the rail (summary / sidebar). */
  rail: ReactNode;
  /** Main content. */
  main: ReactNode;
  /** Order of the stack: 'left' = rail first, 'right' = main first. */
  railSide?: 'left' | 'right';
  /** Ignored on mobile; kept so callers don't change (guía §7.1). */
  railWidth?: 'sm' | 'md';
  /** Ignored on mobile; kept so callers don't change. */
  stickyRail?: boolean;
  /** Ignored on mobile; kept so callers don't change. */
  railTopOffsetClass?: string;
}

/**
 * Antes era una grilla de dos columnas en desktop. La app es mobile-only
 * (guía §3): rail y main siempre apilados en una columna.
 * Se elimina cuando el comparador migre al nuevo diseño.
 */
export function TwoColumn({ rail, main, railSide = 'left' }: TwoColumnProps) {
  return (
    <div className="flex flex-col gap-6">
      {railSide === 'right' ? (
        <>
          <div>{main}</div>
          <div>{rail}</div>
        </>
      ) : (
        <>
          <div>{rail}</div>
          <div>{main}</div>
        </>
      )}
    </div>
  );
}
