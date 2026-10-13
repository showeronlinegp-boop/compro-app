import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { IconBack } from './icons';
import { FOCUS_RING } from './styles';

/**
 * `true` si hay una entrada anterior del historial DENTRO de la app.
 * react-router guarda el índice en `history.state.idx`; en una entrada directa
 * (link pegado, recarga) vale 0 y `navigate(-1)` sacaría al usuario de la app.
 */
function canGoBack(locationKey: string): boolean {
  if (locationKey === 'default') return false;
  const idx = (window.history.state as { idx?: number } | null)?.idx;
  return typeof idx === 'number' ? idx > 0 : true;
}

/**
 * Volver a la pantalla de origen (guía §3.1): usa el historial y, si se entró
 * directo, va a `fallback`.
 */
export function useGoBack(fallback: string) {
  const navigate = useNavigate();
  const location = useLocation();
  return () => {
    if (canGoBack(location.key)) navigate(-1);
    else navigate(fallback, { replace: true });
  };
}

interface PlaceHeaderProps {
  variant: 'place';
  title: string;
  /** Acción a la derecha ("+ Nuevo"). */
  action?: ReactNode;
}

interface TaskHeaderProps {
  variant: 'task';
  title: string;
  /** Adónde volver si no hay historial (entrada directa). */
  backTo: string;
  /** Clase de color del título (p. ej. 'text-fiado' en Anotar). */
  titleClassName?: string;
  /** 'icon' = flecha 44×44 con aria-label; 'label' = flecha + "Volver" (ficha). */
  backStyle?: 'icon' | 'label';
  /** El título sólo para lectores de pantalla (la pantalla ya lo muestra en otro lado). */
  titleHidden?: boolean;
}

export type ScreenHeaderProps = PlaceHeaderProps | TaskHeaderProps;

/**
 * Encabezado de pantalla (guía §4.15).
 * - `place`: título `title-l` + acción opcional (pantallas con barra inferior).
 * - `task`: volver + título `title-m` (pantallas de tarea y ficha).
 */
export function ScreenHeader(props: ScreenHeaderProps) {
  if (props.variant === 'place') {
    return (
      <header className="flex items-center justify-between gap-3">
        <h1 className="m-0 font-display text-title-l text-ink">{props.title}</h1>
        {props.action}
      </header>
    );
  }
  return <TaskHeader {...props} />;
}

function TaskHeader({
  title,
  backTo,
  titleClassName,
  backStyle = 'icon',
  titleHidden = false,
}: TaskHeaderProps) {
  const goBack = useGoBack(backTo);
  const titleClass = titleHidden
    ? 'sr-only'
    : `m-0 font-display text-title-m ${titleClassName ?? 'text-ink'}`;
  if (backStyle === 'label') {
    return (
      <header className="flex flex-col items-start gap-2">
        <button
          type="button"
          onClick={goBack}
          className={`pressable -ml-2 min-h-touch px-2 inline-flex items-center gap-1 rounded-m text-body font-bold text-ink ${FOCUS_RING}`}
        >
          <IconBack size={22} />
          Volver
        </button>
        <h1 className={titleClass}>{title}</h1>
      </header>
    );
  }
  return (
    <header className="flex items-center gap-2">
      <button
        type="button"
        onClick={goBack}
        aria-label="Volver"
        className={`pressable -ml-2 w-11 h-11 flex-none inline-flex items-center justify-center rounded-m text-ink ${FOCUS_RING}`}
      >
        <IconBack />
      </button>
      <h1 className={titleClass}>{title}</h1>
    </header>
  );
}
