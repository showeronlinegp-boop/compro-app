import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { FOCUS_RING } from './styles';

/** Duración visible de un toast (guía §4.14). */
export const TOAST_MS = 3000;

export interface ToastOptions {
  /** Acción opcional, p. ej. "Deshacer". Cierra el toast al tocarla. */
  action?: { label: string; onClick: () => void };
  /** Por defecto `TOAST_MS`. Con acción conviene más tiempo para alcanzar a tocarla. */
  durationMs?: number;
}

interface ToastState extends ToastOptions {
  id: number;
  message: string;
}

interface ToastApi {
  show: (message: string, options?: ToastOptions) => void;
  dismiss: () => void;
}

const ToastContext = createContext<{ api: ToastApi; current: ToastState | null } | null>(null);

/** Toast global del host: uno a la vez; uno nuevo reemplaza al anterior. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ToastState | null>(null);
  const seq = useRef(0);

  const dismiss = useCallback(() => setCurrent(null), []);
  const show = useCallback((message: string, options?: ToastOptions) => {
    seq.current += 1;
    setCurrent({ id: seq.current, message, ...options });
  }, []);

  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => {
      setCurrent((c) => (c?.id === current.id ? null : c));
    }, current.durationMs ?? TOAST_MS);
    return () => clearTimeout(t);
  }, [current]);

  const value = useMemo(() => ({ api: { show, dismiss }, current }), [show, dismiss, current]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

/** `const toast = useToast(); toast.show('Guardado')`. Sólo dentro del host. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return ctx.api;
}

/**
 * Lo monta el HostLayout. Flota 16 px de cada lado, a 90 px del borde con
 * barra inferior y a 20 px sin ella. La región (`<output>`, rol `status`)
 * existe siempre, vacía sin toast, para que los lectores de pantalla anuncien
 * lo que entra.
 */
export function ToastViewport({ withBottomNav }: { withBottomNav: boolean }) {
  const ctx = useContext(ToastContext);
  const toast = ctx?.current;
  return (
    <output
      data-testid="toast-region"
      className={`absolute inset-x-4 z-50 pointer-events-none ${
        withBottomNav ? 'bottom-[90px]' : 'bottom-5'
      }`}
    >
      {ctx && toast && (
        <div className="pointer-events-auto flex items-center gap-3 rounded-[14px] bg-ink text-surface px-4 py-[14px] text-body-s">
          <span className="flex-1">{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action?.onClick();
                ctx.api.dismiss();
              }}
              className={`pressable min-h-touch px-2 -my-2 rounded-m font-bold text-on-dark-body underline ${FOCUS_RING}`}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </output>
  );
}
