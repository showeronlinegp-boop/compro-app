import { FOCUS_RING, FOCUS_RING_INPUT } from '../../../host/ui/styles';
import { TIPOS, TIPO_CLASS } from '../constants';
import type { Mark, Modo, Tipo } from '../types';
import { MiniButton } from './MiniButton';
import { ModoChecklist } from './ModoChecklist';

export interface Draft {
  tipo: Tipo;
  texto: string;
  modo: Modo[];
  mark: Mark | null;
}

/** Borrador de una nota nueva: tipo, marca, texto y modo. */
export function DraftForm({
  draft,
  saving,
  onChange,
  onMarcar,
  onCancel,
  onSave,
}: {
  draft: Draft;
  saving: boolean;
  onChange: (d: Draft) => void;
  onMarcar: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const vacio = !draft.texto.trim();
  const link = `cursor-pointer border-0 bg-transparent p-0 text-caption font-bold text-ink underline ${FOCUS_RING}`;
  return (
    <div className="flex flex-col gap-3 rounded-l border border-border-strong bg-surface-muted p-3">
      <div className="flex gap-2" role="group" aria-label="Tipo de nota">
        {TIPOS.map((tp) => {
          const sel = draft.tipo === tp.id;
          return (
            <button
              key={tp.id}
              type="button"
              aria-pressed={sel}
              onClick={() => onChange({ ...draft, tipo: tp.id })}
              className={`pressable min-h-[40px] flex-1 rounded-m border text-caption font-bold ${
                sel ? `${TIPO_CLASS[tp.id]} border-transparent` : 'border-border bg-surface text-ink'
              } ${FOCUS_RING}`}
            >
              {tp.label}
            </button>
          );
        })}
      </div>
      <p className="m-0 text-caption text-ink-muted">
        {draft.mark ? (
          <>
            Marcado: <b className="text-ink">{draft.mark.elemento || 'un punto de la pantalla'}</b>{' '}
            ·{' '}
            <button type="button" className={link} onClick={onMarcar}>
              marcar de nuevo
            </button>
          </>
        ) : (
          <>
            Sin marca en pantalla ·{' '}
            <button type="button" className={link} onClick={onMarcar}>
              marcar
            </button>
          </>
        )}
      </p>
      <textarea
        // biome-ignore lint/a11y/noAutofocus: el borrador se abre para escribir
        autoFocus
        aria-label="Texto de la nota"
        value={draft.texto}
        rows={4}
        placeholder="¿Qué pasó? ¿Qué esperabas que pase?"
        onChange={(e) => onChange({ ...draft, texto: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !vacio) onSave();
        }}
        className={`w-full resize-y rounded-m border border-border bg-surface p-3 text-body text-ink ${FOCUS_RING_INPUT}`}
      />
      <ModoChecklist modo={draft.modo} onChange={(modo) => onChange({ ...draft, modo })} />
      <div className="flex justify-end gap-2">
        <MiniButton tone="muted" onClick={onCancel}>
          Cancelar
        </MiniButton>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || vacio}
          className={`pressable min-h-[40px] rounded-m px-4 text-caption font-bold ${
            saving || vacio ? 'cursor-default bg-disabled text-surface' : 'bg-ink text-surface'
          } ${FOCUS_RING}`}
        >
          {saving ? 'Guardando…' : 'Guardar nota'}
        </button>
      </div>
    </div>
  );
}
