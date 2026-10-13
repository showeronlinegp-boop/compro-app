import { useLocation } from 'react-router-dom';
import type { NavItem } from '../../host/contract';
import { useComparador } from './ComparadorProvider';

/**
 * Nav reactiva del comparador (C2). Reproduce los items que el viejo
 * `AppShell` armaba para la nav top y la bottom: Explorar recuerda la última
 * búsqueda (`explorarTo`), Intereses y Planner llevan contador (sólo top) y
 * Comparar aparece sólo con `profile.onboarding_done`.
 *
 * `useLocation()` re-renderiza en cada navegación, con el mismo timing que
 * antes tenía `AppShell` al leer el ref durante el render.
 */
export function useNav(): NavItem[] {
  useLocation();
  const { interests, shopping, profile, explorarTo } = useComparador();

  const items: NavItem[] = [
    { id: 'explorar', to: explorarTo.current, label: 'Explorar', icon: '🔍', end: true },
    {
      id: 'intereses',
      to: '/intereses',
      label: 'Intereses',
      icon: '❤️',
      badge: interests.length,
      end: false,
    },
    {
      id: 'planner',
      to: '/planner',
      label: 'Planner',
      icon: '📋',
      badge: shopping.length,
      end: false,
    },
  ];

  if (profile?.onboarding_done) {
    items.push({
      id: 'compare',
      to: '/compare',
      label: 'Comparar',
      icon: '📊',
      iconInTop: true,
      end: false,
    });
  }

  return items;
}
