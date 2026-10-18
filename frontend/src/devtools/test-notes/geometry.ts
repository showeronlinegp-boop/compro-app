import { buildSelector, describeElement } from './mark';
import type { Mark, TestNote } from './types';

/**
 * Geometría de la tool: el ÚNICO archivo con supuestos sobre el layout del host
 * (docs/design-system.md §3):
 * - `main` es hijo directo de la columna y es el único contenedor que scrollea;
 * - la región de toasts es `[data-testid="toast-region"]`;
 * - la barra inferior es `nav[aria-label="Navegación inferior"]` (solo fallback).
 * Si el layout cambia, se ajusta este archivo y sus tests.
 *
 * Todas las posiciones que devuelve son LOCALES a la columna (la raíz de la tool
 * es `absolute inset-0` dentro de ella).
 */

export interface Band {
  top: number;
  bottom: number;
}

export interface Frame {
  /** Rect de la columna del host. */
  column: DOMRect;
  /** Contenedor que scrollea: `main` o, si no hay, el documento. */
  root: Element;
  /** Zona visible de `root` en coordenadas de la ventana. */
  band: Band;
}

/** Lado del pin (px): `h-7 min-w-[28px]`. */
export const PIN_SIZE = 28;

/** Alto máximo de un toast con acción (py 14 + botón 44 con -my-2). */
export const TOAST_SLOT = 56;

const TOAST_REGION = '[data-testid="toast-region"]';
const BOTTOM_NAV = 'nav[aria-label="Navegación inferior"]';

function docRoot(): Element {
  return document.scrollingElement ?? document.documentElement;
}

function isDocRoot(root: Element): boolean {
  return (
    root === document.scrollingElement ||
    root === document.documentElement ||
    root === document.body
  );
}

/** Hijo directo `main` de la columna (sin `:scope`, que jsdom viejo no soporta). */
function mainOf(column: Element): Element | null {
  return Array.from(column.children).find((c) => c.tagName === 'MAIN') ?? null;
}

export function readFrame(column: Element): Frame {
  const main = mainOf(column);
  const root = main ?? docRoot();
  const band: Band = main
    ? (({ top, bottom }) => ({ top, bottom }))(main.getBoundingClientRect())
    : { top: 0, bottom: window.innerHeight };
  return { column: column.getBoundingClientRect(), root, band };
}

/** `clientY` → px desde el tope del contenido de `root`. */
export function toRootY(clientY: number, root: Element): number {
  if (isDocRoot(root)) return clientY + window.scrollY;
  return clientY - root.getBoundingClientRect().top + root.scrollTop;
}

/** Inversa de `toRootY`: px del contenido → `clientY` actual. */
export function fromRootY(posY: number, root: Element): number {
  if (isDocRoot(root)) return posY - window.scrollY;
  return posY + root.getBoundingClientRect().top - root.scrollTop;
}

function rootWidth(root: Element): number {
  return root.clientWidth || root.getBoundingClientRect().width || 1;
}

/** Marca de un clic en `(x, y)` (coords de la ventana) sobre `el` (o la nada). */
export function markFromPoint(x: number, y: number, el: Element | null, f: Frame): Mark {
  const rootLeft = isDocRoot(f.root) ? 0 : f.root.getBoundingClientRect().left;
  return {
    selector: el ? buildSelector(el) : null,
    elemento: el ? describeElement(el) : null,
    pos_x: Math.round(((x - rootLeft) / rootWidth(f.root)) * 10_000) / 10_000,
    pos_y: Math.round(toRootY(y, f.root)),
    viewport_w: window.innerWidth,
  };
}

/** Elemento marcado por `selector`, si sigue en pantalla con tamaño. */
export function findMarked(selector: string | null, doc: Document): DOMRect | null {
  if (!selector) return null;
  try {
    const el = doc.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width || r.height ? r : null;
  } catch {
    return null; // selector inválido: se cae a las coordenadas
  }
}

export interface PinPos {
  top: number;
  left: number;
  exacto: boolean;
}

/**
 * Posición del pin en coordenadas de la columna. Exacta si el selector encuentra
 * el elemento (esquina superior derecha); si no, aproximada desde `pos_x/pos_y`.
 * `null` sin datos o si el punto cae fuera de la banda visible de `main`.
 */
export function pinPosition(
  n: Pick<TestNote, 'selector' | 'pos_x' | 'pos_y'>,
  f: Frame,
  doc: Document,
): PinPos | null {
  const rect = findMarked(n.selector, doc);
  let clientTop: number;
  let clientLeft: number;
  let exacto: boolean;
  if (rect) {
    clientTop = rect.top;
    clientLeft = rect.right;
    exacto = true;
  } else {
    if (n.pos_x === null || n.pos_y === null) return null;
    const rootLeft = isDocRoot(f.root) ? 0 : f.root.getBoundingClientRect().left;
    clientTop = fromRootY(n.pos_y, f.root);
    clientLeft = rootLeft + n.pos_x * rootWidth(f.root);
    exacto = false;
  }
  if (clientTop < f.band.top || clientTop > f.band.bottom) return null;
  const half = PIN_SIZE / 2;
  const top = Math.max(clientTop - half, f.band.top) - f.column.top;
  const left = Math.min(Math.max(clientLeft - half - f.column.left, 0), f.column.width - PIN_SIZE);
  return { top, left, exacto };
}

/**
 * `bottom` de los botones flotantes (px desde el borde inferior de la columna):
 * por encima de la región de toasts + un toast (154 con barra, 84 en 'task');
 * sin región, por encima de la barra inferior; si no, 16.
 */
export function fabBottom(column: Element): number {
  const colBottom = column.getBoundingClientRect().bottom;
  const region = column.querySelector(TOAST_REGION);
  if (region) return Math.round(colBottom - region.getBoundingClientRect().bottom + TOAST_SLOT + 8);
  const nav = column.querySelector(BOTTOM_NAV);
  if (nav) return Math.round(nav.getBoundingClientRect().height + 16);
  return 16;
}
