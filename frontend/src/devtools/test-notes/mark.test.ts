import { describe, expect, it } from 'vitest';
import type { AppModule, ModuleRoute, ResolvedLocation } from '../../host/contract';
import { type NodeLike, buildSelector, describeElement, isOwnUi, pantallaLabel } from './mark';

// Mini DOM falso: alcanza con tagName, id, parentElement, children y atributos.
type FakeNode = NodeLike & { children: FakeNode[] };

function nodo(
  tagName: string,
  {
    id = '',
    attrs = {},
    text = '',
  }: { id?: string; attrs?: Record<string, string>; text?: string } = {},
  hijos: FakeNode[] = [],
): FakeNode {
  const n: FakeNode = {
    tagName: tagName.toUpperCase(),
    id,
    textContent: text,
    children: [],
    parentElement: null,
    getAttribute: (k) => (k in attrs ? (attrs[k] ?? null) : null),
  };
  for (const h of hijos) {
    h.parentElement = n;
    n.children.push(h);
  }
  return n;
}

const nunca = () => false;
const siempre = () => true;

describe('buildSelector', () => {
  it('nth-of-type solo cuando hay hermanos del mismo tag', () => {
    const b1 = nodo('button', { text: 'Guardar' });
    const b2 = nodo('button', { text: 'Cancelar' });
    const span = nodo('span');
    const div = nodo('div', {}, [span, b1, b2]);
    nodo('body', {}, [nodo('main', {}, [div])]);
    expect(buildSelector(b2, nunca)).toBe('body > main > div > button:nth-of-type(2)');
    expect(buildSelector(span, nunca)).toBe('body > main > div > span');
  });

  it('corta en un id usable de un ancestro', () => {
    const btn = nodo('button');
    nodo('body', {}, [nodo('section', { id: 'filtros' }, [btn])]);
    expect(buildSelector(btn, nunca)).toBe('#filtros > button');
  });

  it('Id generado: no usa un id con 3+ dígitos y termina en el path desde body', () => {
    const btn = nodo('button');
    nodo('body', {}, [nodo('div', { id: 'r-83921' }, [btn])]);
    expect(buildSelector(btn, nunca)).toBe('body > div > button');
  });

  it('data-testid gana sobre el id', () => {
    const el = nodo('span', { id: 'total', attrs: { 'data-testid': 'cart-total' } });
    nodo('body', {}, [el]);
    expect(buildSelector(el, nunca)).toBe('[data-testid="cart-total"]');
  });

  it('data-testid de un ancestro ancla el path', () => {
    const btn = nodo('button');
    nodo('body', {}, [nodo('ul', { attrs: { 'data-testid': 'lista' } }, [nodo('li', {}, [btn])])]);
    expect(buildSelector(btn, nunca)).toBe('[data-testid="lista"] > li > button');
  });

  it('aria-label único ancla; no único, sigue con el path', () => {
    const btn = nodo('button', { attrs: { 'aria-label': 'Agregar "uno"' } });
    nodo('body', {}, [nodo('div', {}, [btn])]);
    expect(buildSelector(btn, siempre)).toBe('button[aria-label="Agregar \\"uno\\""]');
    expect(buildSelector(btn, nunca)).toBe('body > div > button');
  });

  it('con el documento real: aria-label repetido no ancla', () => {
    document.body.innerHTML =
      '<div><button aria-label="Borrar">x</button></div><div><button aria-label="Borrar">y</button></div>';
    const btns = document.querySelectorAll('button');
    const segundo = btns[1] as unknown as NodeLike;
    const sel = buildSelector(segundo);
    expect(sel).toBe('body > div:nth-of-type(2) > button');
    expect(document.querySelector(sel)).toBe(btns[1]);
    document.body.innerHTML = '';
  });
});

describe('describeElement', () => {
  it('usa aria-label/placeholder antes que el texto y recorta', () => {
    expect(describeElement(nodo('button', { text: '  Guardar\n cambios ' }))).toBe(
      'Botón: "Guardar cambios"',
    );
    expect(describeElement(nodo('button', { attrs: { 'aria-label': 'Agregar' }, text: '+' }))).toBe(
      'Botón: "Agregar"',
    );
    expect(describeElement(nodo('input', { attrs: { placeholder: 'Buscar producto' } }))).toBe(
      'Campo: "Buscar producto"',
    );
    expect(describeElement(nodo('div'))).toBe('<div>');
    const largo = describeElement(nodo('td', { text: 'x'.repeat(200) }));
    expect(largo.length).toBeLessThan(100);
    expect(largo.endsWith('…"')).toBe(true);
    expect(describeElement(null)).toBe('');
  });
});

describe('isOwnUi', () => {
  it('detecta la UI de notas por data-test-notes en cualquier ancestro', () => {
    const hijo = nodo('span');
    nodo('div', { attrs: { 'data-test-notes': '' } }, [hijo]);
    expect(isOwnUi(hijo)).toBe(true);
    expect(isOwnUi(nodo('span'))).toBe(false);
  });
});

describe('pantallaLabel', () => {
  const route: ModuleRoute = {
    id: 'carrito',
    path: 'carrito',
    component: () => null,
    auth: 'public',
    title: 'Carrito',
  };
  const module: AppModule = {
    id: 'comparador',
    label: 'Comparador',
    basePath: '/',
    routes: [route],
  };
  const loc: ResolvedLocation = { module, route, fullPath: '/carrito', params: {} };

  it('"Módulo › Título de ruta" desde la ubicación resuelta', () => {
    expect(pantallaLabel(loc, '/carrito')).toBe('Comparador › Carrito');
  });

  it('no usa la etiqueta del ítem de nav', () => {
    const conNav: ResolvedLocation = {
      ...loc,
      navItem: { id: 'cart', to: '/carrito', label: 'Mi carrito (3)' },
    };
    expect(pantallaLabel(conNav, '/carrito')).toBe('Comparador › Carrito');
  });

  it('sin ubicación: /mas → "Más", / → "Inicio", otra → pathname', () => {
    expect(pantallaLabel(null, '/mas')).toBe('Más');
    expect(pantallaLabel(null, '/')).toBe('Inicio');
    expect(pantallaLabel(null, '/raro')).toBe('/raro');
  });
});
