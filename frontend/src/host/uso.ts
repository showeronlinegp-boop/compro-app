import { useEffect } from 'react';
import { postKeepalive } from './http';
import { abiertaComoApp } from './install/instalar';

/**
 * Medición de uso para el panel de admin: qué pantallas se abren y acciones
 * que no dejan otro rastro en el backend.
 *
 * Sólo QUÉ pantalla o acción, nunca con qué datos: la pantalla va como
 * `route.id` ('ficha'), no como path ('/fiado/clientes/12'). Se juntan unos
 * segundos y se mandan en un solo POST; al esconder la pestaña se manda lo que
 * haya. Sin sesión no se manda nada.
 */

/** Tiene que coincidir con EVENTOS de backend/src/modules/uso/domain/evento.ts. */
export type EventoUso = 'pantalla' | 'comprobante' | 'instalar';

interface Pendiente {
  evento: EventoUso;
  modulo: string;
  ruta_id: string | null;
}

/** Cuánto se junta antes de mandar. */
export const ESPERA_MS = 10_000;
/** Máximo por envío (igual que LOTE_MAX del backend). */
export const LOTE_MAX = 50;
/** La misma pantalla dos veces seguidas en menos de esto cuenta una (StrictMode, re-renders). */
const REPETIDA_MS = 2_000;

let cola: Pendiente[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let ultima: { clave: string; at: number } | null = null;
let escuchandoCierre = false;

function esMovil(): boolean {
  return window.matchMedia?.('(pointer: coarse)').matches === true;
}

function escucharCierre() {
  if (escuchandoCierre) return;
  escuchandoCierre = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void enviarUso();
  });
}

/** Anota un evento; se manda junto con los demás en unos segundos. */
export function registrarUso(evento: EventoUso, modulo: string, ruta_id: string | null = null) {
  const clave = `${evento}:${modulo}:${ruta_id ?? ''}`;
  const ahora = Date.now();
  if (ultima && ultima.clave === clave && ahora - ultima.at < REPETIDA_MS) return;
  ultima = { clave, at: ahora };

  escucharCierre();
  cola.push({ evento, modulo, ruta_id });
  if (cola.length >= LOTE_MAX) void enviarUso();
  else timer ??= setTimeout(() => void enviarUso(), ESPERA_MS);
}

/** Manda lo pendiente ya. */
export async function enviarUso(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  if (cola.length === 0) return;
  const eventos = cola.slice(0, LOTE_MAX);
  cola = cola.slice(LOTE_MAX);
  await postKeepalive('/uso/eventos', { eventos, standalone: abiertaComoApp(), movil: esMovil() });
}

/** Sólo tests: vacía la cola y olvida la última pantalla. */
export function reiniciarUso() {
  if (timer) clearTimeout(timer);
  timer = null;
  cola = [];
  ultima = null;
}

/** Registra cada pantalla de módulo que se abre (el host la llama una vez, en el layout). */
export function useRegistrarPantallas(modulo: string | undefined, ruta: string | undefined) {
  useEffect(() => {
    if (modulo && ruta) registrarUso('pantalla', modulo, ruta);
  }, [modulo, ruta]);
}
