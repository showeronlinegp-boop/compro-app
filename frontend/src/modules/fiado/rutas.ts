/** Rutas absolutas del módulo (basePath '/fiado'). Única fuente para navegar. */
export const BASE = '/fiado';

export const RUTAS = {
  inicio: BASE,
  clientes: `${BASE}/clientes`,
  nuevoCliente: (nombre?: string) =>
    nombre ? `${BASE}/clientes/nuevo?${new URLSearchParams({ nombre })}` : `${BASE}/clientes/nuevo`,
  ficha: (id: number) => `${BASE}/clientes/${id}`,
} as const;
