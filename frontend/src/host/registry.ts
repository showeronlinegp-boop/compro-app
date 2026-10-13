// Único archivo de host/ que puede importar de modules/ (H5, ver isolation.test.ts).
import { comparador } from '../modules/comparador';
import { fiado } from '../modules/fiado';
import type { AppModule } from './contract';

/** Lista de módulos montados por el host, en orden (el primero queda más afuera en los Providers). */
export const registry: readonly AppModule[] = [comparador, fiado];
