/** Rutas absolutas del módulo (basePath '/fiado'). Única fuente para navegar. */
export const BASE = '/fiado';

export type TipoAnotar = 'fiado' | 'pago';

const conQuery = (path: string, params: Record<string, string | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
};

export const RUTAS = {
  inicio: BASE,
  clientes: `${BASE}/clientes`,
  /**
   * Alta de cliente. `siguiente`: ruta a la que vuelve con `cliente=<id>`
   * agregado (desde Anotar, para dejar elegido al cliente recién creado).
   */
  nuevoCliente: (opts: { nombre?: string; siguiente?: string } = {}) =>
    conQuery(`${BASE}/clientes/nuevo`, opts),
  ficha: (id: number) => `${BASE}/clientes/${id}`,
  editarCliente: (id: number) => `${BASE}/clientes/${id}/editar`,
  /** Anotar fiado o registrar pago, opcionalmente con el cliente ya elegido. */
  anotar: (tipo: TipoAnotar, clienteId?: number) =>
    conQuery(`${BASE}/${tipo === 'fiado' ? 'anotar' : 'pago'}`, {
      cliente: clienteId ? String(clienteId) : undefined,
    }),
  listo: `${BASE}/listo`,
  recordar: (clienteId: number) => `${BASE}/recordar/${clienteId}`,
  avisos: `${BASE}/avisos`,
  ajustes: `${BASE}/ajustes`,
} as const;

/** Agrega `cliente=<id>` a una ruta de Anotar (respeta la query existente). */
export function conCliente(ruta: string, clienteId: number): string {
  const [path, query = ''] = ruta.split('?');
  const q = new URLSearchParams(query);
  q.set('cliente', String(clienteId));
  return `${path}?${q}`;
}

/** Sólo rutas internas del módulo: evita redirecciones abiertas con `siguiente`. */
export function esRutaDelModulo(ruta: string | null): ruta is string {
  return !!ruta && ruta.startsWith(`${BASE}/`) && !ruta.startsWith('//');
}
