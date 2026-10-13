import type { HostTool } from './contract';

/** Herramientas globales del host. En este cambio no hay ninguna (H7). */
export const hostTools: HostTool[] = [];

/** Monta sólo las tools habilitadas; con la lista vacía no agrega markup (`null`). */
export function HostToolsOutlet({ tools = hostTools }: { tools?: readonly HostTool[] }) {
  const enabled = tools.filter((t) => t.enabled);
  if (enabled.length === 0) return null;
  return (
    <>
      {enabled.map(({ id, Component }) => (
        <Component key={id} />
      ))}
    </>
  );
}
