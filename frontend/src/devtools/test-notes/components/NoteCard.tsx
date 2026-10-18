import { FOCUS_RING } from '../../../host/ui/styles';
import {
  ESTADO_CLASS,
  ESTADO_LABEL,
  MODOS,
  PENDIENTES,
  TIPOS,
  TIPO_BORDER,
  TIPO_CLASS,
} from '../constants';
import type { Estado, Modo, TestNote } from '../types';
import { MiniButton } from './MiniButton';
import { ModoChecklist } from './ModoChecklist';

function fmtFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Tarjeta de una nota con sus acciones según el estado. */
export function NoteCard({
  nota,
  activa,
  confirmDel,
  onFocus,
  onIr,
  onEstado,
  onModo,
  onPedirBorrar,
  onCancelarBorrar,
  onBorrar,
}: {
  nota: TestNote;
  activa: boolean;
  confirmDel: boolean;
  onFocus: () => void;
  onIr: () => void;
  onEstado: (estado: Estado) => void;
  onModo: (modo: Modo[]) => void;
  onPedirBorrar: () => void;
  onCancelarBorrar: () => void;
  onBorrar: () => void;
}) {
  const pendiente = PENDIENTES.includes(nota.estado);
  const consulta = nota.estado === 'consulta';
  return (
    <article
      data-testid={`test-note-${nota.id}`}
      onMouseEnter={onFocus}
      className={`flex flex-col gap-2 rounded-m border border-l-4 bg-surface p-3 ${
        TIPO_BORDER[nota.tipo]
      } ${activa ? 'border-ink' : 'border-border'}`}
    >
      <div className="flex flex-wrap items-center gap-2 text-micro">
        <span className="font-bold text-ink">#{nota.id}</span>
        <span className={`rounded-pill px-2 py-0.5 font-bold ${TIPO_CLASS[nota.tipo]}`}>
          {TIPOS.find((t) => t.id === nota.tipo)?.label}
        </span>
        <span className={`rounded-pill px-2 py-0.5 font-bold ${ESTADO_CLASS[nota.estado]}`}>
          {ESTADO_LABEL[nota.estado]}
        </span>
        <span className="ml-auto text-ink-muted">
          {nota.autor} · {fmtFecha(nota.created_at)}
        </span>
      </div>
      <p className="m-0 whitespace-pre-wrap break-words text-body text-ink">{nota.texto}</p>
      <button
        type="button"
        onClick={onIr}
        className={`self-start border-0 bg-transparent p-0 text-left text-caption font-bold text-ink underline ${FOCUS_RING}`}
      >
        {nota.pantalla || nota.ruta}
        {nota.elemento ? ` · ${nota.elemento}` : ''}
      </button>
      {nota.respuesta && (
        <p
          className={`m-0 whitespace-pre-wrap rounded-m px-3 py-2 text-caption text-ink ${
            consulta ? 'bg-late-bg' : 'bg-ok-bg'
          }`}
        >
          <b className={consulta ? 'text-late' : 'text-ok'}>
            {consulta ? 'Pregunta de Claude:' : 'Respuesta de Claude:'}
          </b>{' '}
          {nota.respuesta}
        </p>
      )}
      {pendiente ? (
        <ModoChecklist modo={nota.modo} onChange={onModo} />
      ) : (
        nota.modo.length > 0 && (
          <p className="m-0 text-micro text-ink-muted">
            Pediste:{' '}
            {nota.modo
              .map((m) => MODOS.find((x) => x.id === m)?.label.toLowerCase())
              .filter(Boolean)
              .join(', ')}
          </p>
        )
      )}
      <div className="flex flex-wrap gap-2">
        {nota.estado === 'para_revisar' && (
          <>
            <MiniButton tone="ok" solid onClick={() => onEstado('corregida')}>
              Confirmar
            </MiniButton>
            <MiniButton tone="ink" onClick={() => onEstado('abierta')}>
              Sigue mal
            </MiniButton>
          </>
        )}
        {pendiente && (
          <MiniButton tone="muted" onClick={() => onEstado('descartada')}>
            Descartar
          </MiniButton>
        )}
        {(nota.estado === 'corregida' || nota.estado === 'descartada') && (
          <MiniButton tone="ink" onClick={() => onEstado('abierta')}>
            Reabrir
          </MiniButton>
        )}
        {confirmDel ? (
          <>
            <MiniButton tone="danger" solid onClick={onBorrar}>
              Sí, borrar
            </MiniButton>
            <MiniButton tone="muted" onClick={onCancelarBorrar}>
              No
            </MiniButton>
          </>
        ) : (
          <MiniButton tone="danger" onClick={onPedirBorrar}>
            Borrar
          </MiniButton>
        )}
      </div>
    </article>
  );
}
