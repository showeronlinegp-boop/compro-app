import { useAuth } from '@clerk/clerk-react';
import {
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useActiveModule } from '../../host/nav/ActiveModule';
import { FOCUS_RING } from '../../host/ui/styles';
import { TEST_NOTES_API, apiErrorMessage, testNotesApi } from './api';
import { installCapture, snapshotContext } from './capture';
import { DraftForm, type Draft } from './components/DraftForm';
import { Fabs } from './components/Fabs';
import { Highlights } from './components/Highlights';
import { Dock } from './components/Dock';
import { type LocalRect, MarkBanner, MarkLayer } from './components/MarkLayer';
import { NoteCard } from './components/NoteCard';
import { Pins } from './components/Pins';
import { Sheet } from './components/Sheet';
import { FILTROS, type FiltroId, PENDIENTES, POLL_MS, VIVAS } from './constants';
import {
  type Dock as DockFrame,
  dockFrame,
  fabBottom,
  findMarked,
  markFromPoint,
  pinPosition,
  readFrame,
} from './geometry';
import { isOwnUi, pantallaLabel } from './mark';
import type { Estado, Modo, TestNote } from './types';

/** Rect de la ventana → coordenadas de la columna. */
function toLocal(r: DOMRect, column: Element): LocalRect {
  const c = column.getBoundingClientRect();
  return { top: r.top - c.top, left: r.left - c.left, width: r.width, height: r.height };
}

function filtroDe(estado: Estado): FiltroId {
  return FILTROS.find((f) => f.estados.includes(estado))?.id ?? 'pendientes';
}

const FILTRO_PENDIENTES = { id: 'pendientes', label: 'Pendientes', estados: PENDIENTES } as const;

/**
 * Notas de prueba ("Marcar en pantalla"): herramienta global del host, solo en
 * desarrollo local. Pines, resaltados y la capa de marcado van en la columna
 * del host (sobre lo marcado); el panel va AFUERA, a la derecha de la app, si
 * hay lugar (dock), y si no, como hoja inferior. No conoce el dominio de ningún
 * módulo. Sin sesión no renderiza nada.
 */
export function TestNotes() {
  const { isSignedIn } = useAuth();
  if (!isSignedIn) return null;
  return <TestNotesTool />;
}

function TestNotesTool() {
  const rootRef = useRef<HTMLDivElement>(null);
  const { pathname: ruta } = useLocation();
  const navigate = useNavigate();
  const { location: activa } = useActiveModule();
  const pantalla = pantallaLabel(activa, ruta);

  const [notas, setNotas] = useState<TestNote[]>([]);
  const [error, setError] = useState('');
  const [abierta, setAbierta] = useState(false);
  const [soloEstaPantalla, setSoloEstaPantalla] = useState(true);
  const [filtro, setFiltro] = useState<FiltroId>('pendientes');
  const [marking, setMarking] = useState(false);
  const [hover, setHover] = useState<LocalRect | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const [pendingScroll, setPendingScroll] = useState<number | null>(null);
  const [bottom, setBottom] = useState(16);
  const [dock, setDock] = useState<DockFrame | null>(null);
  const [, setTick] = useState(0);

  const column = (): HTMLElement | null => rootRef.current?.parentElement ?? null;

  // Captura de errores y llamadas fallidas (sin registrar las de la propia tool)
  useEffect(() => {
    installCapture({ ignore: (url) => url.includes(TEST_NOTES_API) });
  }, []);

  const cargar = useCallback(async () => {
    try {
      setNotas(await testNotesApi.list());
      setError('');
    } catch (err) {
      setError(apiErrorMessage(err, 'No se pudieron cargar las notas'));
    }
  }, []);

  useEffect(() => {
    void cargar();
    const id = window.setInterval(() => void cargar(), POLL_MS);
    return () => window.clearInterval(id);
  }, [cargar]);

  // Con lugar a la derecha de la columna, el panel va afuera de la app (dock);
  // si no, FABs + hoja inferior. Los FABs esquivan la barra y los toasts: el
  // chrome cambia con la ruta.
  // biome-ignore lint/correctness/useExhaustiveDependencies: recalcular al cambiar de ruta
  useLayoutEffect(() => {
    const col = column();
    if (!col) return;
    const update = () => {
      setBottom(fabBottom(col));
      const next = dockFrame(col.getBoundingClientRect(), window.innerWidth);
      setDock((prev) =>
        prev?.left === next?.left && prev?.width === next?.width ? prev : next,
      );
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [ruta, activa]);

  const pinesRuta = useMemo(
    () =>
      notas.filter(
        (n) => n.ruta === ruta && VIVAS.includes(n.estado) && (n.selector || n.pos_y !== null),
      ),
    [notas, ruta],
  );

  // Los pines siguen al contenido: scroll de main, resize y cada segundo
  useEffect(() => {
    if (pinesRuta.length === 0 && !draft?.mark && focusId === null) return;
    let raf = 0;
    const bump = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setTick((x) => x + 1));
    };
    window.addEventListener('resize', bump);
    document.addEventListener('scroll', bump, true);
    const id = window.setInterval(bump, 1000);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', bump);
      document.removeEventListener('scroll', bump, true);
      window.clearInterval(id);
    };
  }, [pinesRuta.length, draft?.mark, focusId]);

  // Esc: cancela el marcado o cierra la hoja
  useEffect(() => {
    if (!marking && !abierta) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (marking) {
        setMarking(false);
        setHover(null);
      } else setAbierta(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [marking, abierta]);

  // "Ir a la nota": esperar a que la ruta pinte y llevar la vista al elemento
  useEffect(() => {
    if (pendingScroll === null) return;
    const nota = notas.find((n) => n.id === pendingScroll);
    if (!nota || nota.ruta !== ruta) return;
    let intentos = 0;
    const id = window.setInterval(() => {
      intentos += 1;
      const col = column();
      let el: Element | null = null;
      try {
        el = nota.selector ? document.querySelector(nota.selector) : null;
      } catch {
        el = null;
      }
      if (el && findMarked(nota.selector, document)) {
        el.scrollIntoView({ block: 'center' });
      } else if (intentos < 10) {
        return;
      } else if (col && nota.pos_y !== null) {
        readFrame(col).root.scrollTo({ top: Math.max(nota.pos_y - 160, 0) });
      }
      window.clearInterval(id);
      setPendingScroll(null);
    }, 100);
    return () => window.clearInterval(id);
  }, [pendingScroll, notas, ruta]);

  const elementoBajo = (x: number, y: number): Element | null =>
    document.elementsFromPoint(x, y).find((el) => !isOwnUi(el)) ?? null;

  const onMarkMove = (e: PointerEvent<HTMLDivElement>) => {
    const col = column();
    const el = elementoBajo(e.clientX, e.clientY);
    setHover(el && col ? toLocal(el.getBoundingClientRect(), col) : null);
  };

  const onMarkPick = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const col = column();
    if (!col) return;
    const el = elementoBajo(e.clientX, e.clientY);
    const mark = markFromPoint(e.clientX, e.clientY, el, readFrame(col));
    setMarking(false);
    setHover(null);
    setDraft((d) => ({ tipo: d?.tipo ?? 'error', texto: d?.texto ?? '', modo: d?.modo ?? [], mark }));
    setAbierta(true);
  };

  const empezarMarca = () => {
    setAbierta(false);
    setMarking(true);
  };

  const guardar = async () => {
    if (!draft || !draft.texto.trim() || saving) return;
    setSaving(true);
    try {
      const nota = await testNotesApi.create({
        tipo: draft.tipo,
        texto: draft.texto,
        modo: draft.modo,
        ruta,
        pantalla,
        ...(draft.mark ?? {}),
        contexto: snapshotContext(),
      });
      setNotas((prev) => [nota, ...prev]);
      setDraft(null);
      setFiltro('pendientes');
      setFocusId(nota.id);
      setError('');
    } catch (err) {
      setError(apiErrorMessage(err, 'No se pudo guardar la nota'));
    } finally {
      setSaving(false);
    }
  };

  const actualizar = async (nota: TestNote, patch: { estado?: Estado; modo?: Modo[] }) => {
    try {
      const nueva = await testNotesApi.update(nota.id, patch);
      setNotas((prev) => prev.map((n) => (n.id === nota.id ? nueva : n)));
      setError('');
    } catch (err) {
      setError(apiErrorMessage(err, 'No se pudo actualizar la nota'));
    }
  };

  const borrar = async (nota: TestNote) => {
    try {
      await testNotesApi.remove(nota.id);
      setNotas((prev) => prev.filter((n) => n.id !== nota.id));
      setError('');
    } catch (err) {
      setError(apiErrorMessage(err, 'No se pudo borrar la nota'));
    }
    setConfirmDel(null);
  };

  const irANota = (nota: TestNote) => {
    setFocusId(nota.id);
    if (!dock) setAbierta(false); // la hoja tapa la app; el panel lateral no
    if (nota.ruta !== ruta) navigate(nota.ruta);
    setPendingScroll(nota.id);
  };

  const abrirDesdePin = (nota: TestNote) => {
    setFocusId(nota.id);
    setSoloEstaPantalla(true);
    setFiltro(filtroDe(nota.estado));
    setAbierta(true);
  };

  // Geometría del render actual (recalculada con cada tick)
  const col = column();
  const frame = col ? readFrame(col) : null;
  const pins =
    frame && !marking
      ? pinesRuta.flatMap((nota) => {
          const pos = pinPosition(nota, frame, document);
          return pos ? [{ nota, pos }] : [];
        })
      : [];
  const rectLocal = (selector: string | null | undefined): LocalRect | null => {
    const r = col ? findMarked(selector ?? null, document) : null;
    return r && col ? toLocal(r, col) : null;
  };
  const focusNota = focusId !== null ? notas.find((n) => n.id === focusId) : undefined;
  const focusRect = focusNota && focusNota.ruta === ruta ? rectLocal(focusNota.selector) : null;
  const draftRect = draft?.mark ? rectLocal(draft.mark.selector) : null;

  const pendientesRuta = notas.filter((n) => n.ruta === ruta && VIVAS.includes(n.estado)).length;
  const pendientesTotal = notas.filter((n) => VIVAS.includes(n.estado)).length;
  const filtroActual = FILTROS.find((f) => f.id === filtro) ?? FILTRO_PENDIENTES;
  const visibles = (estados: readonly Estado[]) =>
    notas.filter((n) => estados.includes(n.estado) && (!soloEstaPantalla || n.ruta === ruta));
  const lista = visibles(filtroActual.estados);

  const cancelarMarca = () => {
    setMarking(false);
    setHover(null);
  };
  const subtitulo = `${pantalla} · ${pendientesTotal} pendientes en total`;

  // Contenido del panel: el mismo en el dock lateral y en la hoja inferior
  const contenido = (
    <>
      {error && (
        <p role="alert" className="m-0 rounded-m bg-warn-bg px-3 py-2 text-caption text-danger">
          {error}
        </p>
      )}

      {draft ? (
        <DraftForm
          draft={draft}
          saving={saving}
          onChange={setDraft}
          onMarcar={empezarMarca}
          onCancel={() => setDraft(null)}
          onSave={() => void guardar()}
        />
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={empezarMarca}
            className={`pressable min-h-touch flex-1 rounded-m bg-ink font-display text-button-m text-surface ${FOCUS_RING}`}
          >
            Marcar en pantalla
          </button>
          <button
            type="button"
            onClick={() => setDraft({ tipo: 'error', texto: '', modo: [], mark: null })}
            className={`pressable min-h-touch flex-1 rounded-m border border-border bg-surface font-display text-button-m text-ink ${FOCUS_RING}`}
          >
            Nota sin marcar
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtros">
        {FILTROS.map((f) => {
          const sel = filtro === f.id;
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={sel}
              onClick={() => setFiltro(f.id)}
              className={`min-h-[36px] rounded-pill border px-3 text-caption ${
                sel
                  ? 'border-ink bg-ink font-bold text-surface'
                  : 'border-border bg-surface text-ink-muted'
              } ${FOCUS_RING}`}
            >
              {f.label} {visibles(f.estados).length}
            </button>
          );
        })}
        <label className="ml-auto flex min-h-[36px] cursor-pointer items-center gap-2 text-caption text-ink-muted">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={soloEstaPantalla}
            onChange={(e) => setSoloEstaPantalla(e.target.checked)}
          />
          Solo esta pantalla
        </label>
      </div>

      {lista.length === 0 && (
        <p className="m-0 py-6 text-center text-caption text-ink-muted">
          No hay notas en «{filtroActual.label}»{soloEstaPantalla ? ' en esta pantalla' : ''}.
        </p>
      )}
      {lista.map((n) => (
        <NoteCard
          key={n.id}
          nota={n}
          activa={focusId === n.id}
          confirmDel={confirmDel === n.id}
          onFocus={() => setFocusId(n.id)}
          onIr={() => irANota(n)}
          onEstado={(estado) => void actualizar(n, { estado })}
          onModo={(modo) => void actualizar(n, { modo })}
          onPedirBorrar={() => setConfirmDel(n.id)}
          onCancelarBorrar={() => setConfirmDel(null)}
          onBorrar={() => void borrar(n)}
        />
      ))}
    </>
  );

  return (
    <div
      ref={rootRef}
      data-test-notes=""
      className="pointer-events-none absolute inset-0 z-[60] overflow-hidden"
    >
      {!marking && <Highlights draft={draftRect} focus={focusRect} />}
      {!marking && <Pins pins={pins} focusId={focusId} onOpen={abrirDesdePin} />}

      {marking && (
        <MarkLayer
          hover={hover}
          onMove={onMarkMove}
          onPick={onMarkPick}
          onCancel={cancelarMarca}
          banner={!dock}
        />
      )}

      {dock ? (
        // Afuera de la app: siempre visible, no tapa lo que se prueba
        <Dock frame={dock} subtitulo={subtitulo}>
          {marking ? <MarkBanner onCancel={cancelarMarca} /> : contenido}
        </Dock>
      ) : (
        <>
          {!marking && !abierta && (
            <Fabs
              bottom={bottom}
              pendientesRuta={pendientesRuta}
              onMarcar={empezarMarca}
              onNotas={() => setAbierta(true)}
            />
          )}
          {abierta && !marking && (
            <Sheet
              subtitulo={subtitulo}
              onClose={() => {
                setAbierta(false);
                setFocusId(null);
              }}
            >
              {contenido}
            </Sheet>
          )}
        </>
      )}
    </div>
  );
}
