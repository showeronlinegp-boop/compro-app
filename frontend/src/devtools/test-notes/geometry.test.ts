import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DOCK_MAX,
  type Frame,
  PIN_SIZE,
  TOAST_SLOT,
  dockFrame,
  fabBottom,
  fromRootY,
  markFromPoint,
  pinPosition,
  readFrame,
  toRootY,
} from './geometry';

interface R {
  top: number;
  left: number;
  width: number;
  height: number;
}

function rect({ top, left, width, height }: R): DOMRect {
  return {
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function setRect(el: Element, r: R) {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(rect(r));
}

/** Columna de 400 × 800 en x=100, con `main` de y=56 a y=670 (header arriba, barra abajo). */
function layout() {
  document.body.innerHTML = `
    <div id="col">
      <header></header>
      <main><p id="cerca">x</p><p id="lejos">y</p></main>
      <nav aria-label="Navegación inferior"></nav>
      <output data-testid="toast-region"></output>
    </div>`;
  const column = document.getElementById('col') as HTMLElement;
  const main = column.querySelector('main') as HTMLElement;
  setRect(column, { top: 0, left: 100, width: 400, height: 800 });
  setRect(main, { top: 56, left: 100, width: 400, height: 614 });
  Object.defineProperty(main, 'clientWidth', { value: 400, configurable: true });
  main.scrollTop = 200;
  return { column, main };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('readFrame', () => {
  it('raíz = main hijo de la columna; banda = rect de main', () => {
    const { column, main } = layout();
    const f = readFrame(column);
    expect(f.root).toBe(main);
    expect(f.band).toEqual({ top: 56, bottom: 670 });
    expect(f.column.left).toBe(100);
  });

  it('sin main: raíz = documento y banda = ventana', () => {
    document.body.innerHTML = '<div id="col"><section></section></div>';
    const column = document.getElementById('col') as HTMLElement;
    const f = readFrame(column);
    expect(f.root).toBe(document.scrollingElement ?? document.documentElement);
    expect(f.band).toEqual({ top: 0, bottom: window.innerHeight });
  });
});

describe('toRootY / fromRootY', () => {
  it('elemento: relativo al contenido de main (scrollTop incluido) e inversa exacta', () => {
    const { main } = layout();
    expect(toRootY(156, main)).toBe(156 - 56 + 200);
    expect(fromRootY(300, main)).toBe(156);
  });

  it('documento: clientY + scrollY', () => {
    const root = document.scrollingElement ?? document.documentElement;
    const prev = window.scrollY;
    Object.defineProperty(window, 'scrollY', { value: 50, configurable: true, writable: true });
    try {
      expect(toRootY(10, root)).toBe(60);
      expect(fromRootY(60, root)).toBe(10);
    } finally {
      Object.defineProperty(window, 'scrollY', { value: prev, configurable: true, writable: true });
    }
  });
});

describe('markFromPoint', () => {
  it('pos_x sobre el ancho de main, pos_y sobre su contenido, selector y descripción', () => {
    const { column } = layout();
    const el = document.getElementById('cerca') as HTMLElement;
    const m = markFromPoint(300, 156, el, readFrame(column));
    expect(m).toEqual({
      selector: '#cerca',
      elemento: '<p>: "x"',
      pos_x: 0.5,
      pos_y: 300,
      viewport_w: window.innerWidth,
    });
  });

  it('sin elemento: solo coordenadas', () => {
    const { column } = layout();
    const m = markFromPoint(100, 56, null, readFrame(column));
    expect(m.selector).toBeNull();
    expect(m.elemento).toBeNull();
    expect(m.pos_x).toBe(0);
    expect(m.pos_y).toBe(200);
  });
});

describe('pinPosition', () => {
  function frame(): Frame {
    const { column } = layout();
    return readFrame(column);
  }

  it('exacto: esquina superior derecha del elemento, en coords de la columna', () => {
    const f = frame();
    setRect(document.getElementById('cerca') as Element, {
      top: 200,
      left: 120,
      width: 100,
      height: 40,
    });
    expect(pinPosition({ selector: '#cerca', pos_x: null, pos_y: null }, f, document)).toEqual({
      top: 200 - PIN_SIZE / 2,
      left: 220 - PIN_SIZE / 2 - 100,
      exacto: true,
    });
  });

  it('aproximado: selector que no matchea → posición guardada', () => {
    const f = frame();
    // pos_y 300 del contenido con scrollTop 200 y main en y=56 → clientY 156
    expect(pinPosition({ selector: '#no-existe', pos_x: 0.25, pos_y: 300 }, f, document)).toEqual({
      top: 156 - PIN_SIZE / 2,
      left: 100 + 100 - PIN_SIZE / 2 - 100,
      exacto: false,
    });
  });

  it('selector inválido no rompe: cae a la posición guardada', () => {
    const f = frame();
    expect(pinPosition({ selector: '###', pos_x: 0, pos_y: 300 }, f, document)?.exacto).toBe(false);
  });

  it('fuera de banda (debajo del borde visible de main) → null', () => {
    const f = frame();
    setRect(document.getElementById('lejos') as Element, {
      top: 700,
      left: 120,
      width: 100,
      height: 40,
    });
    expect(pinPosition({ selector: '#lejos', pos_x: null, pos_y: null }, f, document)).toBeNull();
    // aproximado arriba del borde superior (scrolleado hacia abajo)
    expect(pinPosition({ selector: null, pos_x: 0.5, pos_y: 100 }, f, document)).toBeNull();
  });

  it('pegado al borde superior de la banda: el pin no se sube al header', () => {
    const f = frame();
    setRect(document.getElementById('cerca') as Element, {
      top: 60,
      left: 120,
      width: 100,
      height: 40,
    });
    expect(pinPosition({ selector: '#cerca', pos_x: null, pos_y: null }, f, document)?.top).toBe(
      56,
    );
  });

  it('nunca se sale por la derecha de la columna', () => {
    const f = frame();
    setRect(document.getElementById('cerca') as Element, {
      top: 200,
      left: 400,
      width: 100,
      height: 40,
    });
    expect(pinPosition({ selector: '#cerca', pos_x: null, pos_y: null }, f, document)?.left).toBe(
      400 - PIN_SIZE,
    );
  });

  it('sin selector ni coordenadas → null', () => {
    const f = frame();
    expect(pinPosition({ selector: null, pos_x: null, pos_y: null }, f, document)).toBeNull();
  });
});

describe('fabBottom', () => {
  it('región de toasts a 90 px (con barra) → 154', () => {
    const { column } = layout();
    setRect(column.querySelector('[data-testid="toast-region"]') as Element, {
      top: 710,
      left: 116,
      width: 368,
      height: 0,
    });
    expect(fabBottom(column)).toBe(90 + TOAST_SLOT + 8);
    expect(fabBottom(column)).toBe(154);
  });

  it("región a 20 px (chrome 'task') → 84", () => {
    const { column } = layout();
    setRect(column.querySelector('[data-testid="toast-region"]') as Element, {
      top: 780,
      left: 116,
      width: 368,
      height: 0,
    });
    expect(fabBottom(column)).toBe(84);
  });

  it('sin región: alto de la barra + 16; sin barra: 16', () => {
    const { column } = layout();
    column.querySelector('[data-testid="toast-region"]')?.remove();
    setRect(column.querySelector('nav') as Element, {
      top: 726,
      left: 100,
      width: 400,
      height: 74,
    });
    expect(fabBottom(column)).toBe(90);
    column.querySelector('nav')?.remove();
    expect(fabBottom(column)).toBe(16);
  });
});

describe('dockFrame', () => {
  it('desktop: el panel va a la derecha de la columna, sin pasar el máximo', () => {
    // columna de 480 centrada en 1440 → right = 960; libre = 1440 - 960 - 32 = 448
    expect(dockFrame({ right: 960 }, 1440)).toEqual({ left: 976, width: DOCK_MAX });
  });

  it('con poco más del mínimo usa todo el espacio libre', () => {
    // 1280: right = 880; libre = 1280 - 880 - 32 = 368
    expect(dockFrame({ right: 880 }, 1280)).toEqual({ left: 896, width: 368 });
  });

  it('ventana angosta (celular o navegador achicado): null → hoja inferior', () => {
    expect(dockFrame({ right: 390 }, 390)).toBeNull();
    expect(dockFrame({ right: 700 }, 1000)).toBeNull(); // libre = 268
  });
});
