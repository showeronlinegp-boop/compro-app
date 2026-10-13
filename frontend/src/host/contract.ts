import type { ComponentType, LazyExoticComponent, ReactNode } from 'react';

/**
 * Contrato entre el host y los módulos de dominio.
 *
 * El host (layout, ruteo, nav, identidad) sólo conoce estos tipos; cada módulo
 * exporta un `AppModule` y `host/registry.ts` es la única lista de módulos.
 */

export type RouteComponent = ComponentType | LazyExoticComponent<ComponentType>;

/** 'full' = pantalla "de lugar" (layout actual); 'task' = pantalla de tarea, sin BottomNav. */
export type RouteChrome = 'full' | 'task';

export interface ModuleRoute {
  /** Único dentro del módulo: 'explorar'. */
  id: string;
  /** Relativo a `basePath`; '' = índice. */
  path: string;
  /** Sin props: los wrappers leen el context del módulo. */
  component: RouteComponent;
  /** Obligatorio: el gating siempre es explícito. */
  auth: 'public' | 'required';
  /** Para resolveLocation / herramientas del host. */
  title: string;
  /** H8; omitido = 'full'. */
  chrome?: RouteChrome;
}

export interface NavItem {
  id: string;
  /** Puede llevar search: '/?q=leche'. */
  to: string;
  /** Texto base: 'Intereses'. */
  label: string;
  /**
   * `string` = emoji (lo de hoy); `ReactNode` = SVG (feat/design-system).
   * Bottom: siempre en `<span aria-hidden>`; top: sólo si `iconInTop`.
   * (`string | ReactNode` equivale a `ReactNode` para TS; se deja explícito por intención.)
   */
  icon?: string | ReactNode;
  /** Comparar → top '📊 Comparar'. */
  iconInTop?: boolean;
  /** Definido ⇒ contador en top; NO se muestra en bottom. */
  badge?: number;
  end?: boolean;
}

export interface AppModule {
  id: string;
  label: string;
  /** '/' para el comparador. */
  basePath: string;
  routes: readonly ModuleRoute[];
  Provider?: ComponentType<{ children: ReactNode }>;
  useNav?: () => NavItem[];
  slots?: { headerActions?: ComponentType; overlays?: ComponentType };
}

export interface ResolvedLocation {
  module: AppModule;
  route: ModuleRoute;
  fullPath: string;
  params: Record<string, string | undefined>;
  /** Sólo vía useHostLocation (la nav es reactiva). */
  navItem?: NavItem;
}

export interface HostTool {
  id: string;
  enabled: boolean;
  Component: ComponentType;
}
