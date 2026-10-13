import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { FOCUS_RING } from './styles';

/** Variantes de la guía §4. Cada color se usa sólo con su significado. */
export type ButtonVariant =
  | 'primary'
  | 'fiado'
  | 'pago'
  | 'whatsapp'
  | 'on-dark'
  | 'outline'
  | 'outline-pago'
  | 'soft'
  | 'text';

/** Alturas: xl 76 (acciones de inicio), l 60 (confirmar), m 52, s 44, chip 40. */
export type ButtonSize = 'xl' | 'l' | 'm' | 's' | 'chip';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-surface',
  fiado: 'bg-fiado text-surface',
  pago: 'bg-pago text-surface',
  whatsapp: 'bg-whatsapp text-surface',
  'on-dark': 'bg-surface text-ink',
  outline: 'bg-surface text-ink border-[1.5px] border-ink',
  'outline-pago': 'bg-surface text-pago border-[1.5px] border-pago',
  soft: 'bg-surface text-ink border-[1.5px] border-border',
  text: 'bg-transparent text-pago active:text-pago-hover',
};

const SIZE: Record<ButtonSize, string> = {
  xl: 'min-h-[76px] px-4 rounded-l font-display text-button-l',
  l: 'min-h-[60px] px-5 rounded-l font-display text-button-l',
  m: 'min-h-[52px] px-4 rounded-m font-display text-button-m',
  s: 'min-h-touch px-3 rounded-m font-body text-body-s font-bold',
  chip: 'min-h-[40px] px-4 rounded-pill font-body text-body-s font-bold',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Ocupa todo el ancho disponible. */
  block?: boolean;
  /** Ícono a la izquierda del texto (ya es aria-hidden). */
  icon?: ReactNode;
}

/**
 * Botón del sistema. Siempre un `<button>` real (type="button" por defecto);
 * deshabilitado usa `--disabled` sin importar la variante.
 */
export function Button({
  variant = 'primary',
  size = 'l',
  block = false,
  icon,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  const color = rest.disabled
    ? 'bg-disabled text-surface border-transparent cursor-default'
    : VARIANT[variant];
  return (
    <button
      type={type}
      className={`pressable inline-flex items-center justify-center gap-2 text-center ${SIZE[size]} ${color} ${
        block ? 'w-full' : ''
      } ${FOCUS_RING} ${className ?? ''}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
