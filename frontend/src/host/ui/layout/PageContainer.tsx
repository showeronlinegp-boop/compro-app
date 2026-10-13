import type { ReactNode } from 'react';

interface PageContainerProps {
  children: ReactNode;
  /**
   * Se mantiene por compatibilidad con el comparador: en la columna mobile de
   * 480 px 'default' y 'narrow' se ven igual.
   */
  size?: 'default' | 'narrow';
  className?: string;
}

/**
 * Padding estándar de una pantalla (guía §3): 24 px arriba y abajo, gutter de
 * 16 px a los costados. El ancho máximo lo pone el HostLayout.
 */
export function PageContainer({ children, className }: PageContainerProps) {
  return <div className={`w-full px-4 py-6 ${className ?? ''}`}>{children}</div>;
}
