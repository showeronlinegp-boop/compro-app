import { type InputHTMLAttributes, useId } from 'react';
import { FOCUS_RING } from './styles';

// ─── FilterChips ──────────────────────────────────────────────────────────────

interface FilterChipsProps<T extends string> {
  /** Nombre accesible del grupo: "Ordenar por". */
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * Pastillas de filtro/orden de 40 px con `aria-pressed` (guía §4.5). Se
 * envuelven en varias líneas: nunca scroll horizontal.
 */
export function FilterChips<T extends string>({
  label,
  options,
  value,
  onChange,
}: FilterChipsProps<T>) {
  return (
    <fieldset className="m-0 p-0 border-0 min-w-0 flex flex-wrap gap-2">
      <legend className="sr-only">{label}</legend>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(o.value)}
            className={`pressable min-h-[40px] px-4 rounded-pill border-[1.5px] border-ink text-body-s font-bold ${
              selected ? 'bg-ink text-surface' : 'bg-surface text-ink'
            } ${FOCUS_RING}`}
          >
            {o.label}
          </button>
        );
      })}
    </fieldset>
  );
}

// ─── TextField ────────────────────────────────────────────────────────────────

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Label siempre visible arriba del input. */
  label: string;
  /** 'question' = la pregunta principal de la pantalla ("¿A quién?"): body-s 700. */
  labelTone?: 'caption' | 'question';
  /** Texto de ayuda o error debajo. */
  hint?: string;
  /** 'compact' = 46 px (nota opcional); default 52 px. */
  size?: 'default' | 'compact';
}

/**
 * Input con label visible (guía §4.6). Texto de 17 px para que iOS no haga
 * zoom; foco con borde 2 px `--focus`. Para montos NO se usa: va el Keypad.
 */
export function TextField({
  label,
  labelTone = 'caption',
  hint,
  size = 'default',
  id,
  className,
  ...rest
}: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const labelClass =
    labelTone === 'question' ? 'text-body-s font-bold text-ink' : 'text-caption text-ink-muted';
  return (
    <div className="flex flex-col gap-[6px]">
      <label htmlFor={inputId} className={labelClass}>
        {label}
      </label>
      <input
        id={inputId}
        aria-describedby={hintId}
        className={`${size === 'compact' ? 'h-[46px]' : 'h-[52px]'} w-full rounded-m border-[1.5px] border-border bg-surface px-[14px] text-body-l text-ink placeholder:text-ink-disabled focus:outline-none focus:border-2 focus:border-focus ${className ?? ''}`}
        {...rest}
      />
      {hint && (
        <p id={hintId} className="m-0 text-caption text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
