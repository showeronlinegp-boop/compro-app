import type { ReactNode } from 'react';

interface PageContainerProps {
  children: ReactNode;
  /**
   * size='default' → full-viewport-width fluid layout with responsive gutters
   *                  (all non-Onboarding pages). Uses the whole screen; the grid
   *                  density adapts via auto-fill, so wide screens show more
   *                  columns instead of leaving empty side margins.
   * size='narrow'  → max-w-lg centered card (reserved for Onboarding / wizard flows).
   */
  size?: 'default' | 'narrow';
  className?: string;
}

/**
 * Unified page-width wrapper. The default size is FLUID (full width) — it
 * intentionally has no max-width cap so large displays use all available space
 * instead of a centered 1280px column with dead side gutters. Responsive
 * gutters: px-4 (mobile) → sm:px-6 (≥640px) → lg:px-8 (≥1024px).
 *
 * Onboarding keeps its own narrow layout and must NOT use this component.
 */
export function PageContainer({ children, size = 'default', className }: PageContainerProps) {
  const widthClass = size === 'narrow' ? 'max-w-lg mx-auto' : 'w-full';

  return (
    <div className={`${widthClass} px-4 sm:px-6 lg:px-8 py-6 ${className ?? ''}`}>
      {children}
    </div>
  );
}
