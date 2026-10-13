import type { ReactNode } from 'react';

interface EmptyStateProps {
  /** Emoji or icon character displayed large above the title. */
  icon: string;
  /** Primary heading — explains what is empty. */
  title: string;
  /** Secondary text — explains why and what to do next. */
  description: string;
  /** Optional CTA — a button or link passed from the caller. */
  action?: ReactNode;
}

/**
 * Reusable empty-state block. Fills the canvas proportionally so the page
 * never looks broken at any viewport width.
 *
 * All copy (title, description, action label) belongs in the CALLER — this
 * component is purely structural.
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="max-w-md mx-auto py-16 lg:py-24 text-center">
        <p className="text-4xl mb-3" aria-hidden="true">
          {icon}
        </p>
        <p className="text-lg font-semibold text-gray-800">{title}</p>
        <p className="text-sm text-gray-500 mt-2">{description}</p>
        {action && <div className="mt-6">{action}</div>}
      </div>
    </div>
  );
}
