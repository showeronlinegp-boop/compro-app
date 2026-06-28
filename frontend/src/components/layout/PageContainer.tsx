import type { ReactNode } from 'react';

interface PageContainerProps {
  children: ReactNode;
  /**
   * size='default' → max-w-7xl with responsive gutters (all non-Onboarding pages).
   * size='narrow'  → max-w-lg centered card (reserved for Onboarding / wizard flows).
   */
  size?: 'default' | 'narrow';
  className?: string;
}

/**
 * Unified page-width wrapper. Replaces ad-hoc max-w-* mx-auto px-4 py-* wrappers
 * across all non-Onboarding pages. Ensures consistent responsive gutters:
 * px-4 (mobile) → sm:px-6 (≥640px) → lg:px-8 (≥1024px).
 *
 * Onboarding keeps its own narrow layout and must NOT use this component.
 */
export function PageContainer({ children, size = 'default', className }: PageContainerProps) {
  const widthClass = size === 'narrow' ? 'max-w-lg' : 'max-w-7xl';

  return (
    <div className={`${widthClass} mx-auto px-4 sm:px-6 lg:px-8 py-6 ${className ?? ''}`}>
      {children}
    </div>
  );
}
