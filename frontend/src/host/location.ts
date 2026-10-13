import { type RouteObject, matchPath, matchRoutes, useLocation } from 'react-router-dom';
import type { AppModule, ResolvedLocation, RouteChrome } from './contract';
import { useNavGroups } from './nav/NavItemsProvider';
import { flattenRoutes } from './routing';

/**
 * Resuelve `pathname` contra las rutas de `modules` con `matchRoutes` de
 * react-router (mismo ranking que `<Routes>`). Pura: NO completa `navItem`.
 * Devuelve `null` si nada matchea (`/sign-in/...`, `/no-existe`).
 */
export function resolveLocation(
  pathname: string,
  modules: readonly AppModule[],
): ResolvedLocation | null {
  const flat = flattenRoutes(modules);
  const routeObjects: RouteObject[] = flat.map(({ module, route, fullPath }) => ({
    id: `${module.id}:${route.id}`,
    path: fullPath,
  }));
  const matches = matchRoutes(routeObjects, pathname);
  const leaf = matches?.[matches.length - 1];
  if (!leaf) return null;
  const hit = flat.find(({ module, route }) => `${module.id}:${route.id}` === leaf.route.id);
  if (!hit) return null;
  return {
    module: hit.module,
    route: hit.route,
    fullPath: hit.fullPath,
    params: { ...leaf.params },
  };
}

/** Chrome de la ruta activa (H8): `null` o sin campo → `'full'`. */
export function chromeOf(loc: ResolvedLocation | null): RouteChrome {
  return loc?.route.chrome ?? 'full';
}

/**
 * Ubicación actual resuelta contra los módulos montados, con `navItem` tomado
 * de la nav reactiva del módulo (su `to` sin search matchea `fullPath`).
 * Sólo dentro del layout del host (necesita `NavItemsProvider`).
 */
export function useHostLocation(): ResolvedLocation | null {
  const { pathname } = useLocation();
  const groups = useNavGroups();
  const loc = resolveLocation(
    pathname,
    groups.map((g) => g.module),
  );
  if (!loc) return null;
  const items = groups.find((g) => g.module === loc.module)?.items ?? [];
  const navItem = items.find(
    (i) => matchPath(loc.fullPath, new URL(i.to, 'http://x').pathname) !== null,
  );
  return navItem ? { ...loc, navItem } : loc;
}
