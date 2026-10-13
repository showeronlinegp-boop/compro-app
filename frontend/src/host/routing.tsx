import { type ReactNode, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import type { AppModule, ModuleRoute, RouteComponent } from './contract';

/** Une `basePath` y un `path` relativo: joinPath('/', '') → '/', joinPath('/', 'intereses') → '/intereses'. */
export function joinPath(basePath: string, path: string): string {
  const base = basePath.replace(/\/+$/, '');
  const rel = path.replace(/^\/+/, '');
  if (!rel) return base || '/';
  return `${base}/${rel}`;
}

export interface FlatRoute {
  module: AppModule;
  route: ModuleRoute;
  fullPath: string;
}

/** Aplana las rutas de todos los módulos, en orden de registry, con su path absoluto. */
export function flattenRoutes(modules: readonly AppModule[]): FlatRoute[] {
  return modules.flatMap((module) =>
    module.routes.map((route) => ({
      module,
      route,
      fullPath: joinPath(module.basePath, route.path),
    })),
  );
}

const REACT_LAZY_TYPE = Symbol.for('react.lazy');

/** `true` si el componente viene de `React.lazy` (sólo esos se envuelven en Suspense). */
export function isLazyComponent(c: RouteComponent): boolean {
  return (c as unknown as { $$typeof?: symbol }).$$typeof === REACT_LAZY_TYPE;
}

/** Elemento de una ruta: `<C/>`, con `RequireAuth` si es 'required' y `Suspense` sólo si es lazy. */
export function routeElement(r: ModuleRoute) {
  const C = r.component;
  let el = <C />;
  if (isLazyComponent(C)) el = <Suspense fallback={null}>{el}</Suspense>;
  if (r.auth === 'required') el = <RequireAuth>{el}</RequireAuth>;
  return el;
}

/** Ruta propia del host (p. ej. "Más"), montada junto a las de los módulos. */
export interface HostRoute {
  path: string;
  element: ReactNode;
}

/**
 * `<Routes>` internas del layout, generadas desde los módulos (H2) más las
 * rutas propias del host. Sin ruta `*` (H1).
 */
export function ModuleRoutes({
  modules,
  hostRoutes = [],
}: {
  modules: readonly AppModule[];
  hostRoutes?: readonly HostRoute[];
}) {
  return (
    <Routes>
      {hostRoutes.map(({ path, element }) => (
        <Route key={`host:${path}`} path={path} element={element} />
      ))}
      {flattenRoutes(modules).map(({ module, route, fullPath }) => (
        <Route key={`${module.id}:${route.id}`} path={fullPath} element={routeElement(route)} />
      ))}
    </Routes>
  );
}
