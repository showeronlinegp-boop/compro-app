import { HOST_MORE_PATH, type ResolvedLocation } from '../../host/contract';

/**
 * Lógica pura de "marcar en pantalla" (port de neggo `testNotesMark.js`).
 * Trabaja sobre cualquier objeto con forma de nodo del DOM, así se testea sin navegador.
 */

export interface NodeLike {
  tagName: string;
  id?: string;
  parentElement: NodeLike | null;
  children?: ArrayLike<NodeLike>;
  getAttribute?: (name: string) => string | null;
  textContent?: string | null;
  innerText?: string;
}

/** Ids que parecen generados (números, hashes) no sirven para volver a encontrar el elemento. */
export function idUsable(id: string | undefined): id is string {
  return !!id && /^[a-zA-Z][\w-]*$/.test(id) && !/\d{3,}/.test(id);
}

/** Valor de atributo listo para un selector CSS entre comillas dobles. */
function quote(v: string): string {
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function attr(node: NodeLike, name: string): string {
  return node.getAttribute?.(name) ?? '';
}

/** Por defecto, "único" = un solo match en el documento real (si hay documento). */
function uniqueInDocument(sel: string): boolean {
  if (typeof document === 'undefined') return false;
  try {
    return document.querySelectorAll(sel).length === 1;
  } catch {
    return false;
  }
}

/** Ancla estable del nodo, o `null`: `[data-testid]` → `#id` usable → `tag[aria-label]` único. */
function anchorOf(node: NodeLike, isUnique: (sel: string) => boolean): string | null {
  const testId = attr(node, 'data-testid');
  if (testId) return `[data-testid=${quote(testId)}]`;
  if (idUsable(node.id)) return `#${node.id}`;
  const label = attr(node, 'aria-label');
  if (label) {
    const sel = `${node.tagName.toLowerCase()}[aria-label=${quote(label)}]`;
    if (isUnique(sel)) return sel;
  }
  return null;
}

/**
 * Selector CSS estable del elemento: la primera ancla encontrada subiendo desde
 * el elemento y, por debajo de ella, `tag` o `tag:nth-of-type(n)` por nivel. Sin
 * ancla, el path arranca en `body`.
 */
export function buildSelector(
  el: NodeLike,
  isUnique: (sel: string) => boolean = uniqueInDocument,
): string {
  const parts: string[] = [];
  let node: NodeLike | null = el;
  while (node?.tagName) {
    const tag = node.tagName.toLowerCase();
    if (tag === 'body' || tag === 'html') break;
    const anchor = anchorOf(node, isUnique);
    if (anchor) {
      parts.unshift(anchor);
      return parts.join(' > ');
    }
    const parent: NodeLike | null = node.parentElement;
    if (parent?.children) {
      const current: NodeLike = node;
      const siblings = Array.from(parent.children).filter((c) => c.tagName === current.tagName);
      parts.unshift(
        siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(current) + 1})` : tag,
      );
    } else {
      parts.unshift(tag);
    }
    node = parent;
  }
  return parts.length ? `body > ${parts.join(' > ')}` : 'body';
}

const NOMBRES_TAG: Record<string, string> = {
  button: 'Botón',
  a: 'Enlace',
  input: 'Campo',
  select: 'Selector',
  textarea: 'Texto',
  img: 'Imagen',
  td: 'Celda',
  th: 'Encabezado',
  tr: 'Fila',
  h1: 'Título',
  h2: 'Título',
  h3: 'Título',
  label: 'Etiqueta',
  table: 'Tabla',
  nav: 'Navegación',
};

/** Descripción legible del elemento para que la nota diga QUÉ se marcó. */
export function describeElement(el: NodeLike | null): string {
  if (!el?.tagName) return '';
  const tag = el.tagName.toLowerCase();
  const texto = (
    attr(el, 'aria-label') ||
    attr(el, 'placeholder') ||
    attr(el, 'title') ||
    attr(el, 'alt') ||
    String(el.innerText || el.textContent || '')
  )
    .replace(/\s+/g, ' ')
    .trim();
  const nombre = NOMBRES_TAG[tag] ?? `<${tag}>`;
  if (!texto) return nombre;
  return `${nombre}: "${texto.length > 80 ? `${texto.slice(0, 77)}…` : texto}"`;
}

/** ¿El nodo pertenece a la propia UI de notas? (no se puede marcar a sí misma) */
export function isOwnUi(el: NodeLike | null): boolean {
  let node = el;
  while (node) {
    if (node.getAttribute && node.getAttribute('data-test-notes') !== null) return true;
    node = node.parentElement;
  }
  return false;
}

/**
 * Nombre de la pantalla: `"<módulo> › <título de ruta>"` desde la ubicación
 * resuelta del host (`useActiveModule().location`), nunca desde la nav. Si no
 * resuelve: "Más" en `/mas`, "Inicio" en `/`, si no el pathname.
 */
export function pantallaLabel(loc: ResolvedLocation | null, pathname: string): string {
  if (loc) return `${loc.module.label} › ${loc.route.title}`;
  if (pathname === HOST_MORE_PATH) return 'Más';
  if (pathname === '/') return 'Inicio';
  return pathname;
}
