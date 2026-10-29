import { useSyncExternalStore } from 'react';

/**
 * Instalar la app en el celu (PWA, nota #7).
 *
 * - Android/Chrome: el navegador avisa con `beforeinstallprompt` que se puede
 *   instalar; lo guardamos y al tocar "Instalar" abrimos su cartel oficial.
 *   Si la app ya está instalada, Chrome no lo manda y no ofrecemos nada.
 * - iPhone/iPad: Safari no deja instalar desde la página; sólo mostramos los
 *   pasos ("Compartir" → "Agregar a inicio").
 * - Ya instalada: abierta desde el ícono (`display-mode: standalone`), o lo
 *   recordamos en el celu (evento `appinstalled` o "Ya la agregué" en iPhone).
 */

/** Evento de Chrome que todavía no está en los tipos del DOM. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type ModoInstalar = 'android' | 'ios';

export interface EstadoInstalar {
  /** Cómo se instala en este celu; `null` = no se puede o ya está instalada. */
  modo: ModoInstalar | null;
  /** El usuario cerró la tarjeta de Inicio (la opción en "Más" sigue). */
  tarjetaOculta: boolean;
}

const KEY_INSTALADA = 'neggo.app-instalada';
const KEY_TARJETA_OCULTA = 'neggo.instalar-tarjeta-oculta';

let aviso: BeforeInstallPromptEvent | null = null;
let estado: EstadoInstalar = { modo: null, tarjetaOculta: false };
const oyentes = new Set<() => void>();

function leer(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function guardar(key: string) {
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    // Sin almacenamiento (modo privado): se vuelve a ofrecer la próxima vez.
  }
}

/** Abierta desde el ícono de inicio (app instalada). */
export function abiertaComoApp(): boolean {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

function esIOS(): boolean {
  const ua = navigator.userAgent;
  // El iPad nuevo se presenta como Mac: lo delata la pantalla táctil.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function calcular(): EstadoInstalar {
  const tarjetaOculta = leer(KEY_TARJETA_OCULTA);
  if (abiertaComoApp() || leer(KEY_INSTALADA)) return { modo: null, tarjetaOculta };
  if (aviso) return { modo: 'android', tarjetaOculta };
  if (esIOS()) return { modo: 'ios', tarjetaOculta };
  return { modo: null, tarjetaOculta };
}

function actualizar() {
  const nuevo = calcular();
  if (nuevo.modo === estado.modo && nuevo.tarjetaOculta === estado.tarjetaOculta) return;
  estado = nuevo;
  for (const oyente of oyentes) oyente();
}

let escuchando = false;

/**
 * Engancha los eventos del navegador. Va en `main.tsx`, antes del render:
 * Chrome manda `beforeinstallprompt` una sola vez y bien temprano.
 */
export function escucharInstalacion() {
  if (escuchando) return;
  escuchando = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // nos guardamos el aviso para nuestro botón
    aviso = e as BeforeInstallPromptEvent;
    actualizar();
  });
  window.addEventListener('appinstalled', () => {
    aviso = null;
    guardar(KEY_INSTALADA);
    actualizar();
  });
  estado = calcular();
}

/** Abre el cartel de Chrome. Devuelve `true` si el usuario aceptó. */
export async function instalarApp(): Promise<boolean> {
  if (!aviso) return false;
  const actual = aviso;
  aviso = null; // Chrome no deja usar el mismo aviso dos veces
  await actual.prompt();
  const { outcome } = await actual.userChoice;
  if (outcome === 'accepted') guardar(KEY_INSTALADA);
  actualizar();
  return outcome === 'accepted';
}

/** iPhone: el usuario dice que ya la agregó (Safari no nos avisa). */
export function marcarInstalada() {
  guardar(KEY_INSTALADA);
  actualizar();
}

export function ocultarTarjetaInstalar() {
  guardar(KEY_TARJETA_OCULTA);
  actualizar();
}

function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

export function useInstalar(): EstadoInstalar {
  return useSyncExternalStore(suscribir, () => estado);
}
