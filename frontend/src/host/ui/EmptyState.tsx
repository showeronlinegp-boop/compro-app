import type { ReactNode } from 'react';

interface EmptyStateProps {
  /**
   * Ícono grande arriba del título. Código nuevo pasa un SVG de `./icons`;
   * el comparador todavía pasa emoji hasta su migración (guía §7.1).
   */
  icon: ReactNode;
  /** Primary heading — explains what is empty. */
  title: string;
  /** Secondary text — explains why and what to do next. */
  description: string;
  /** Optional CTA — a button or link passed from the caller. */
  action?: ReactNode;
}

/**
 * Estado vacío de pantalla completa. Para una lista vacía dentro de una
 * tarjeta usar `EmptyNote` (una sola frase, guía §4.16).
 *
 * All copy (title, description, action label) belongs in the CALLER — this
 * component is purely structural.
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="max-w-md mx-auto py-16 text-center text-ink">
        <div className="text-[40px] mb-3 flex justify-center text-ink-muted" aria-hidden="true">
          {icon}
        </div>
        <p className="m-0 font-display text-title-s">{title}</p>
        <p className="m-0 text-body-s text-ink-muted mt-2">{description}</p>
        {action && <div className="mt-6">{action}</div>}
      </div>
    </div>
  );
}
