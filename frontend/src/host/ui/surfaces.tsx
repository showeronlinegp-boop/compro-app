import type { ReactNode } from 'react';
import { FOCUS_RING } from './styles';

// ─── Card ─────────────────────────────────────────────────────────────────────

interface CardProps {
  /** 'dark' = el único bloque oscuro de la pantalla (p. ej. tarjeta Neggo). */
  tone?: 'light' | 'dark';
  /** Padding 20 (default) o 14 para tarjetas compactas. */
  padding?: 'default' | 'compact';
  className?: string;
  children: ReactNode;
}

/** Tarjeta blanca `radius-xl`, sin sombra (guía §4). */
export function Card({ tone = 'light', padding = 'default', className, children }: CardProps) {
  const toneClass = tone === 'dark' ? 'bg-ink text-surface' : 'bg-surface text-ink';
  const pad = padding === 'compact' ? 'p-[14px]' : 'p-5';
  return <div className={`rounded-xl ${pad} ${toneClass} ${className ?? ''}`}>{children}</div>;
}

// ─── Section ──────────────────────────────────────────────────────────────────

interface SectionProps {
  title: string;
  /** Contenido a la derecha del título (contador, link). */
  aside?: ReactNode;
  children: ReactNode;
}

/** Título de sección `title-s` + contenido, separados por `stack-section` (10 px). */
export function Section({ title, aside, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-[10px]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-title-s text-ink">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

// ─── List / ListRow ───────────────────────────────────────────────────────────

/** Lista blanca `radius-l`; las filas llevan separador `--line` salvo la última. */
export function List({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul aria-label={label} className="bg-surface rounded-l flex flex-col overflow-hidden">
      {children}
    </ul>
  );
}

interface ListRowProps {
  /** Avatar, imagen o ícono a la izquierda. */
  leading?: ReactNode;
  title: ReactNode;
  /** Línea secundaria (`caption`, muted salvo que el caller la pinte). */
  subtitle?: ReactNode;
  /** Monto o dato a la derecha (no interactivo si hay `onClick`). */
  trailing?: ReactNode;
  /** Toda la fila (salvo `action`) es un botón, p. ej. para abrir la ficha. */
  onClick?: () => void;
  /**
   * Botón propio a la derecha ("Recordar"). Queda FUERA del botón de la fila:
   * nunca se anidan elementos interactivos.
   */
  action?: ReactNode;
}

/**
 * Fila de lista (guía §4.3). Con `onClick`, la fila es un `<button>`; sin él
 * es un contenedor. `action` va al lado del botón, nunca adentro.
 */
export function ListRow({ leading, title, subtitle, trailing, onClick, action }: ListRowProps) {
  const body = (
    <>
      {leading}
      <div className="flex-1 min-w-0">
        <div className="text-body font-bold text-ink truncate">{title}</div>
        {subtitle != null && <div className="text-caption text-ink-muted">{subtitle}</div>}
      </div>
      {trailing}
    </>
  );
  const rowClass = 'flex items-center gap-3 px-[14px] py-3 min-h-touch text-left w-full';
  const main = onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={`pressable bg-surface ${rowClass} ${action ? 'pr-2' : ''} ${FOCUS_RING}`}
    >
      {body}
    </button>
  ) : (
    <div className={rowClass}>{body}</div>
  );
  return (
    <li className="border-b border-line last:border-b-0">
      {action ? (
        <div className="flex items-center bg-surface">
          <div className="flex-1 min-w-0">{main}</div>
          <div className="flex-none pr-[14px]">{action}</div>
        </div>
      ) : (
        main
      )}
    </li>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

/** Círculo con la inicial: 40 px en listas, 56 px en la ficha. */
export function Avatar({ name, size = 'm' }: { name: string; size?: 'm' | 'l' }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const dims =
    size === 'l' ? 'w-14 h-14 text-[24px] font-extrabold' : 'w-10 h-10 text-[17px] font-bold';
  return (
    <span
      aria-hidden="true"
      className={`${dims} flex-none rounded-pill bg-avatar text-ink font-display flex items-center justify-center`}
    >
      {initial}
    </span>
  );
}

// ─── Pill ─────────────────────────────────────────────────────────────────────

export type PillTone = 'neutral' | 'warn' | 'late' | 'ok';

const PILL_TONE: Record<PillTone, string> = {
  neutral: 'bg-avatar text-ink',
  warn: 'bg-warn-bg text-warn-strong',
  late: 'bg-late-bg text-late',
  ok: 'bg-ok-bg text-ok',
};

/** Etiqueta o contador (`radius-pill`, `micro` 700). */
export function Pill({ tone = 'neutral', children }: { tone?: PillTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-pill px-[10px] py-[3px] text-micro font-bold ${PILL_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

// ─── Notice ───────────────────────────────────────────────────────────────────

/** Aviso que informa y no bloquea (`--warn-bg`). `<output>` = rol `status` implícito. */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <output className="block rounded-m bg-warn-bg text-warn text-body-s p-3">{children}</output>
  );
}

// ─── DataCells ────────────────────────────────────────────────────────────────

/** Grilla de 2–3 celdas `--surface-muted` con label `micro` y valor `body-s` 700. */
export function DataCells({ cells }: { cells: readonly { label: string; value: ReactNode }[] }) {
  return (
    <dl
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}
    >
      {cells.map((c) => (
        <div key={c.label} className="rounded-m bg-surface-muted p-[10px] min-w-0">
          <dt className="text-micro font-bold text-ink-muted">{c.label}</dt>
          <dd className="m-0 text-body-s font-bold text-ink truncate">{c.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ─── WhatsAppBubble ───────────────────────────────────────────────────────────

/** Vista previa del mensaje que se va a abrir en WhatsApp (guía §4.9). */
export function WhatsAppBubble({ text, label }: { text: string; label?: string }) {
  return (
    <figure className="m-0">
      {label && <figcaption className="mb-[6px] text-caption text-ink-muted">{label}</figcaption>}
      <blockquote className="m-0 bg-whatsapp-bubble rounded-[14px_14px_14px_4px] p-4 text-body-l text-ink whitespace-pre-line">
        {text}
      </blockquote>
    </figure>
  );
}

// ─── EmptyNote ────────────────────────────────────────────────────────────────

/** Estado vacío dentro de una tarjeta o lista: una sola frase (guía §4.16). */
export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="m-0 px-[14px] py-4 text-body-s text-ink-muted">{children}</p>;
}
