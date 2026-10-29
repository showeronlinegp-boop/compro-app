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
   * SVG de `host/ui/icons` (guía §2.4). Se renderiza en un `<span aria-hidden>`.
   * Un string (emoji) todavía funciona, pero la guía lo prohíbe en código nuevo.
   */
  icon?: ReactNode;
  /** Contador; > 0 se muestra como burbuja sobre el ícono en la barra inferior. */
  badge?: number;
  end?: boolean;
}

/**
 * Ítems por módulo que entran en la barra inferior; el host suma "Más" como
 * cuarto ítem fijo y los sobrantes se listan en la pantalla "Más" (guía §3.1).
 */
export const MAX_BOTTOM_ITEMS = 3;

/** Ruta propia del host. Ningún módulo puede declarar una ruta que caiga acá. */
export const HOST_MORE_PATH = '/mas';

/** Panel de uso (sólo admins; el backend responde 403 al resto). */
export const HOST_ADMIN_PATH = '/admin';

export interface AppModule {
  id: string;
  label: string;
  /** '/' para el comparador. Al cambiar de módulo desde "Más" se navega acá. */
  basePath: string;
  routes: readonly ModuleRoute[];
  Provider?: ComponentType<{ children: ReactNode }>;
  useNav?: () => NavItem[];
  /**
   * `headerActions`: si existe, el host muestra una barra superior compacta
   * (marca + acciones + cuenta) en las rutas de ESTE módulo. Sin él, cada
   * pantalla pone su propio `ScreenHeader` (guía §4.15).
   * `overlays`: montados siempre, sobre todas las rutas.
   */
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
