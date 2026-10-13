import { type ReactNode, createContext, useContext } from 'react';
import type { AppModule, NavItem } from '../contract';

export interface NavGroup {
  module: AppModule;
  items: NavItem[];
}

const NavItemsContext = createContext<NavGroup[] | null>(null);

interface ScopeProps {
  modules: readonly AppModule[];
  index: number;
  acc: NavGroup[];
  children: ReactNode;
}

/**
 * Un eslabón por módulo: llama a SU `useNav()` una sola vez (si lo tiene),
 * acumula los items y delega en el siguiente. El último publica la lista.
 * Así top, bottom y useHostLocation leen la MISMA lista (H3) sin romper las
 * reglas de hooks.
 */
function ModuleNavScope({ modules, index, acc, children }: ScopeProps) {
  const module = modules[index];
  if (!module) {
    return <NavItemsContext.Provider value={acc}>{children}</NavItemsContext.Provider>;
  }
  if (module.useNav) {
    return (
      <ModuleNavCollector
        modules={modules}
        index={index}
        acc={acc}
        useNav={module.useNav}
        module={module}
      >
        {children}
      </ModuleNavCollector>
    );
  }
  return (
    <ModuleNavScope modules={modules} index={index + 1} acc={[...acc, { module, items: [] }]}>
      {children}
    </ModuleNavScope>
  );
}

function ModuleNavCollector({
  modules,
  index,
  acc,
  module,
  useNav,
  children,
}: ScopeProps & { module: AppModule; useNav: () => NavItem[] }) {
  const items = useNav();
  return (
    <ModuleNavScope modules={modules} index={index + 1} acc={[...acc, { module, items }]}>
      {children}
    </ModuleNavScope>
  );
}

/** Sin DOM: resuelve los `NavItem[]` de todos los módulos y los publica por context. */
export function NavItemsProvider({
  modules,
  children,
}: {
  modules: readonly AppModule[];
  children: ReactNode;
}) {
  return (
    <ModuleNavScope modules={modules} index={0} acc={[]}>
      {children}
    </ModuleNavScope>
  );
}

/** Items agrupados por módulo, en orden de registry. Sólo dentro de `NavItemsProvider`. */
export function useNavGroups(): NavGroup[] {
  const groups = useContext(NavItemsContext);
  if (!groups) throw new Error('useNavGroups debe usarse dentro de <NavItemsProvider>');
  return groups;
}

/** Todos los items, concatenados en orden de registry. */
export function useNavItems(): NavItem[] {
  return useNavGroups().flatMap((g) => g.items);
}
