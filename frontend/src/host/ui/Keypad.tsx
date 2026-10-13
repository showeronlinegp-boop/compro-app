import { FOCUS_RING } from './styles';

/** Máximo de dígitos (montos de hasta $ 999.999.999). */
export const KEYPAD_MAX_DIGITS = 9;

/** Tecla de borrar (se dibuja con un ícono y se anuncia como "Borrar"). */
export const KEY_BORRAR = 'borrar';

/**
 * Aplica una tecla a un monto en dígitos: sin ceros a la izquierda y con un
 * máximo de 9 dígitos. `KEY_BORRAR` borra el último.
 */
export function applyKey(value: string, key: string): string {
  if (key === KEY_BORRAR) return value.slice(0, -1);
  const next = value + key;
  const sinCeros = next.replace(/^0+/, '');
  if (sinCeros.length > KEYPAD_MAX_DIGITS) return value;
  return sinCeros;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', KEY_BORRAR] as const;

interface KeypadProps {
  /** Monto actual en dígitos ('' = vacío). */
  value: string;
  onChange: (value: string) => void;
}

/**
 * Teclado numérico propio (guía §4.7): grilla 3 × 4 (1-9, 00, 0, borrar) con teclas de 54 px.
 * Para montos nunca se usa un `<input>`: así no aparece el teclado del sistema
 * ni hace zoom, y el monto no admite decimales ni signos.
 */
export function Keypad({ value, onChange }: KeypadProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          aria-label={k === KEY_BORRAR ? 'Borrar' : undefined}
          onClick={() => onChange(applyKey(value, k))}
          className={`pressable h-[54px] rounded-m bg-surface text-ink font-display text-keypad ${FOCUS_RING}`}
        >
          {k === KEY_BORRAR ? <BorrarIcono /> : k}
        </button>
      ))}
    </div>
  );
}

function BorrarIcono() {
  return (
    <svg
      width={26}
      height={26}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="mx-auto"
    >
      <path d="M9 5h11v14H9l-6-7z" />
      <path d="M12.5 9.5l5 5M17.5 9.5l-5 5" />
    </svg>
  );
}
