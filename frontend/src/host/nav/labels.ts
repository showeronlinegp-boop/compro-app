import type { NavItem } from '../contract';

/**
 * Texto de un item en la nav superior. Reproduce al carácter el template
 * histórico del header, incluido `'Intereses '` (espacio final) con badge 0.
 * El ícono se concatena sólo si es `string` (emoji) y `iconInTop`; un ícono
 * no-`string` lo renderiza `TopNav` aparte.
 */
export const topLabel = (i: NavItem): string =>
  (i.iconInTop && typeof i.icon === 'string' ? `${i.icon} ` : '') +
  (i.badge === undefined ? i.label : `${i.label} ${i.badge ? `(${i.badge})` : ''}`);
