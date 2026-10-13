import { createElement } from 'react';
import { useLocation } from 'react-router-dom';
import type { NavItem } from '../../host/contract';
import { IconCompare, IconHeart, IconList, IconSearch } from '../../host/ui/icons';
import { useComparador } from './ComparadorProvider';

/**
 * Nav reactiva del comparador (C2). Reproduce los items que el viejo
 * `AppShell` armaba: Explorar recuerda la última búsqueda (`explorarTo`),
 * Intereses y Planner llevan contador y Comparar aparece sólo con
 * `profile.onboarding_done`. Comparar es el 4.º item: el host lo lista en "Más".
 *
 * `useLocation()` re-renderiza en cada navegación, con el mismo timing que
 * antes tenía `AppShell` al leer el ref durante el render.
 */
export function useNav(): NavItem[] {
  useLocation();
  const { interests, shopping, profile, explorarTo } = useComparador();

  const items: NavItem[] = [
    {
      id: 'explorar',
      to: explorarTo.current,
      label: 'Explorar',
      icon: createElement(IconSearch),
      end: true,
    },
    {
      id: 'intereses',
      to: '/intereses',
      label: 'Intereses',
      icon: createElement(IconHeart),
      badge: interests.length,
      end: false,
    },
    {
      id: 'planner',
      to: '/planner',
      label: 'Planner',
      icon: createElement(IconList),
      badge: shopping.length,
      end: false,
    },
  ];

  if (profile?.onboarding_done) {
    items.push({
      id: 'compare',
      to: '/compare',
      label: 'Comparar',
      icon: createElement(IconCompare),
      end: false,
    });
  }

  return items;
}
