// Único archivo de host/ que puede importar de modules/ (H5, ver isolation.test.ts).
import { comparador } from '../modules/comparador';
import { fiado } from '../modules/fiado';
import type { AppModule } from './contract';

/**
 * Compras (comparador) sólo en dev y tests: el build de producción lo deja
 * afuera salvo VITE_ENABLE_COMPARADOR=true. Al ser constante en build, el
 * bundle de producción ni siquiera incluye su código.
 */
export const COMPARADOR_HABILITADO: boolean =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_COMPARADOR === 'true';

/** Lista de módulos montados por el host, en orden (el primero queda más afuera en los Providers). */
export const registry: readonly AppModule[] = [
  ...(COMPARADOR_HABILITADO ? [comparador] : []),
  fiado,
];
