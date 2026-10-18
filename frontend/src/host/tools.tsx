import { Suspense, lazy } from 'react';
import type { HostTool } from './contract';

/**
 * Herramientas globales del host.
 *
 * Notas de prueba ("Marcar en pantalla") sólo en desarrollo local con
 * `VITE_TEST_NOTES=1` (en `frontend/.env.development.local`). En un build de
 * producción `import.meta.env.DEV` es el literal `false`: la rama entera es
 * código muerto y el chunk de `devtools/` no se emite.
 */
export const hostTools: HostTool[] =
  import.meta.env.DEV && import.meta.env.VITE_TEST_NOTES === '1'
    ? [{ id: 'test-notes', enabled: true, Component: lazy(() => import('../devtools/test-notes')) }]
    : [];

/**
 * Monta sólo las tools habilitadas, cada una en su `Suspense` (pueden ser
 * diferidas); con la lista vacía no agrega markup (`null`).
 */
export function HostToolsOutlet({ tools = hostTools }: { tools?: readonly HostTool[] }) {
  const enabled = tools.filter((t) => t.enabled);
  if (enabled.length === 0) return null;
  return (
    <>
      {enabled.map(({ id, Component }) => (
        <Suspense key={id} fallback={null}>
          <Component />
        </Suspense>
      ))}
    </>
  );
}
