import type { CapturedApi, CapturedError, Contexto } from './types';

/**
 * Captura de contexto técnico (port de neggo `testNotesCapture.js`): los últimos
 * errores de consola y las llamadas a `/api/` que fallaron, para que la nota ya
 * traiga la pista técnica. La instala la tool al montarse (no `main.tsx`).
 */

export const CAPTURE_MAX = 15;

const errores: CapturedError[] = [];
const api: CapturedApi[] = [];

/** Agrega al final y descarta lo más viejo. */
export function pushLimited<T>(lista: T[], item: T, max = CAPTURE_MAX): T[] {
  lista.push(item);
  if (lista.length > max) lista.splice(0, lista.length - max);
  return lista;
}

/** Convierte lo que llega a `console.error` en texto corto (máx. 400). */
export function toMessage(args: readonly unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return `${a.name}: ${a.message}`;
      if (typeof a === 'string') return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
}

const hora = () => new Date().toLocaleTimeString('es-AR', { hour12: false });

function sinOrigen(url: string): string {
  return url.replace(window.location.origin, '');
}

interface Installed {
  fetch: typeof window.fetch;
  consoleError: typeof console.error;
  onError: (e: ErrorEvent) => void;
  onRejection: (e: PromiseRejectionEvent) => void;
}

let installed: Installed | null = null;

export interface CaptureOptions {
  /** Llamadas que NO se registran (las de la propia tool). */
  ignore: (url: string) => boolean;
  max?: number;
}

/** Idempotente: la segunda llamada no hace nada. */
export function installCapture({ ignore, max = CAPTURE_MAX }: CaptureOptions): void {
  if (installed || typeof window === 'undefined') return;

  const originalFetch = window.fetch;
  const originalError = console.error;

  const onError = (e: ErrorEvent) => {
    pushLimited(
      errores,
      {
        at: hora(),
        tipo: 'error',
        mensaje: toMessage([e.error ?? e.message]),
        origen: e.filename ? `${sinOrigen(e.filename)}:${e.lineno}` : undefined,
      },
      max,
    );
  };
  const onRejection = (e: PromiseRejectionEvent) => {
    pushLimited(
      errores,
      { at: hora(), tipo: 'promesa rechazada', mensaje: toMessage([e.reason]) },
      max,
    );
  };

  console.error = (...args: unknown[]) => {
    pushLimited(errores, { at: hora(), tipo: 'console.error', mensaje: toMessage(args) }, max);
    originalError.apply(console, args);
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : (input?.url ?? '');
    const metodo = (
      init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')
    ).toUpperCase();
    const esApi = url.includes('/api/') && !ignore(url);
    try {
      const res = await originalFetch(input, init);
      if (esApi && !res.ok) {
        let error = '';
        try {
          const body = (await res.clone().json()) as { error?: unknown } | null;
          error = String(body?.error ?? '').slice(0, 300);
        } catch {
          /* respuesta sin JSON */
        }
        pushLimited(
          api,
          { at: hora(), metodo, url: sinOrigen(url), status: res.status, error },
          max,
        );
      }
      return res;
    } catch (err) {
      if (esApi) {
        pushLimited(
          api,
          {
            at: hora(),
            metodo,
            url: sinOrigen(url),
            status: 'sin respuesta',
            error: err instanceof Error ? err.message : String(err),
          },
          max,
        );
      }
      throw err;
    }
  };

  installed = { fetch: originalFetch, consoleError: originalError, onError, onRejection };
}

/** Deshace la instalación y vacía lo capturado (tests y desmontaje). */
export function uninstallCapture(): void {
  if (installed) {
    window.fetch = installed.fetch;
    console.error = installed.consoleError;
    window.removeEventListener('error', installed.onError);
    window.removeEventListener('unhandledrejection', installed.onRejection);
    installed = null;
  }
  errores.length = 0;
  api.length = 0;
}

/** Foto del contexto en el momento de guardar la nota. */
export function snapshotContext(): Contexto {
  return {
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    userAgent: navigator.userAgent,
    errores: [...errores],
    api: [...api],
  };
}
