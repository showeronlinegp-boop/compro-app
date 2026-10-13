import type { ReactNode } from 'react';
import type { AppModule } from './contract';

/**
 * Compone los `Provider` de TODOS los módulos alrededor del layout (H4).
 * El primer módulo del registry queda afuera de todo.
 */
export function ModuleProviders({
  modules,
  children,
}: {
  modules: readonly AppModule[];
  children: ReactNode;
}) {
  return (
    <>
      {modules.reduceRight<ReactNode>(
        (inner, { id, Provider }) => (Provider ? <Provider key={id}>{inner}</Provider> : inner),
        children,
      )}
    </>
  );
}
