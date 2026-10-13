import type { ReactNode } from 'react';

interface TwoColumnProps {
  /** Content rendered in the narrower rail (sidebar). */
  rail: ReactNode;
  /** Content rendered in the wider main area. */
  main: ReactNode;
  /** Which side the rail appears on at lg+. Defaults to 'left'. */
  railSide?: 'left' | 'right';
  /**
   * Rail width at lg+:
   *   'sm' → 18rem (288px) — compact sidebar
   *   'md' → 22rem (352px) — comfortable summary panel
   */
  railWidth?: 'sm' | 'md';
  /**
   * When true, the rail's inner wrapper gets lg:sticky lg:self-start so it remains
   * visible while the main column scrolls. Has no effect below lg (mobile stays static).
   */
  stickyRail?: boolean;
  /**
   * Tailwind top-* class that clears the fixed navbar when the rail is sticky.
   * Defaults to 'top-[4.5rem]' (navbar h-14=56px + ~16px gap).
   */
  railTopOffsetClass?: string;
}

/**
 * Responsive two-column grid primitive.
 * - Below lg: single column (rail and main stacked, rail on top by default).
 * - At lg+: two-column CSS grid with the configured rail width.
 *
 * No data, no state — pure layout.
 */
export function TwoColumn({
  rail,
  main,
  railSide = 'left',
  railWidth = 'sm',
  stickyRail = false,
  railTopOffsetClass = 'top-[4.5rem]',
}: TwoColumnProps) {
  const gridColsClass =
    railWidth === 'md' ? 'lg:grid-cols-[22rem_1fr]' : 'lg:grid-cols-[18rem_1fr]';

  const railStickyClass = stickyRail ? `lg:sticky lg:self-start ${railTopOffsetClass}` : '';

  const railEl = (
    <div>
      <div className={railStickyClass}>{rail}</div>
    </div>
  );

  const mainEl = <div>{main}</div>;

  return (
    <div className={`grid grid-cols-1 ${gridColsClass} gap-6`}>
      {railSide === 'right' ? (
        <>
          {mainEl}
          {railEl}
        </>
      ) : (
        <>
          {railEl}
          {mainEl}
        </>
      )}
    </div>
  );
}
