import { MODOS } from '../constants';
import type { Modo } from '../types';

/** Qué se le pide a Claude antes de tocar código. Sin nada tildado, la trabaja directo. */
export function ModoChecklist({
  modo,
  onChange,
}: {
  modo: readonly Modo[];
  onChange: (modo: Modo[]) => void;
}) {
  const toggle = (id: Modo) =>
    onChange(modo.includes(id) ? modo.filter((m) => m !== id) : [...modo, id]);
  const directo = modo.length === 0;
  return (
    <fieldset className="m-0 flex flex-col gap-1 rounded-m border border-border bg-surface px-3 py-2">
      <legend className="px-1 text-micro font-bold text-ink-muted">
        Antes de tocar código, quiero que Claude…
      </legend>
      {MODOS.map((m) => (
        <label
          key={m.id}
          className="flex min-h-[36px] cursor-pointer items-center gap-2 text-caption text-ink"
        >
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={modo.includes(m.id)}
            onChange={() => toggle(m.id)}
          />
          {m.label}
        </label>
      ))}
      <p className={`m-0 text-micro ${directo ? 'text-ok' : 'text-ink-muted'}`}>
        {directo
          ? 'Sin nada tildado: Claude la resuelve directo y te la deja para revisar.'
          : 'Claude no va a tocar código hasta que vos se lo digas.'}
      </p>
    </fieldset>
  );
}
