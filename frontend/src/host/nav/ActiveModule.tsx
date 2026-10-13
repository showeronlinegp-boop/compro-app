import { type ReactNode, createContext, useContext, useRef } from 'react';
import type { AppModule, NavItem, ResolvedLocation } from '../contract';
import { useHostLocation } from '../location';
import { useNavGroups } from './NavItemsProvider';

interface ActiveModuleValue {
  /** Módulo de la ruta actual; en rutas del host ("Más", desconocidas), el último visitado. */
  module: AppModule | null;
  /** Items de nav de ese módulo, en orden. */
  items: NavItem[];
  /** Ubicación resuelta (null en rutas del host o desconocidas). */
  location: ResolvedLocation | null;
}

const ActiveModuleContext = createContext<ActiveModuleValue | null>(null);

/**
 * Resuelve el módulo activo una sola vez por render para todo el layout.
 * Recuerda el último módulo visitado, así "Más" y una ruta desconocida siguen
 * mostrando la barra del módulo de donde venía el usuario.
 * Sólo dentro de `NavItemsProvider`.
 */
export function ActiveModuleProvider({
  modules,
  children,
}: {
  modules: readonly AppModule[];
  children: ReactNode;
}) {
  const location = useHostLocation();
  const groups = useNavGroups();
  const last = useRef<AppModule | null>(null);
  if (location) last.current = location.module;
  const module = location?.module ?? last.current ?? modules[0] ?? null;
  const items = groups.find((g) => g.module === module)?.items ?? [];
  return (
    <ActiveModuleContext.Provider value={{ module, items, location }}>
      {children}
    </ActiveModuleContext.Provider>
  );
}

export function useActiveModule(): ActiveModuleValue {
  const ctx = useContext(ActiveModuleContext);
  if (!ctx) throw new Error('useActiveModule debe usarse dentro de <ActiveModuleProvider>');
  return ctx;
}
