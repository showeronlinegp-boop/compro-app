import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HostApp } from '../../host/HostApp';
import type { AppModule, HostTool } from '../../host/contract';
import { TestNotes } from './TestNotes';
import type { TestNote } from './types';

// ---------------------------------------------------------------------------
// Clerk con sesión conmutable y API de notas mockeada (TEST_NOTES_API y
// apiErrorMessage quedan reales).
// ---------------------------------------------------------------------------
const auth = vi.hoisted(() => ({ signedIn: true }));

vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ isSignedIn: auth.signedIn }),
  SignedIn: ({ children }: { children: ReactNode }) => (auth.signedIn ? children : null),
  SignedOut: ({ children }: { children: ReactNode }) => (auth.signedIn ? null : children),
  RedirectToSignIn: () => null,
  UserButton: () => null,
  SignInButton: ({ children }: { children: ReactNode }) => children,
  SignIn: () => null,
  SignUp: () => null,
}));

const api = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  testNotesApi: api,
}));

// ---------------------------------------------------------------------------
// Módulo falso: una ruta 'full' con un botón y una 'task'
// ---------------------------------------------------------------------------
const Lista = () => (
  <>
    <h1>Lista</h1>
    <button type="button" aria-label="Agregar" onClick={() => agregado()}>
      +
    </button>
  </>
);
const agregado = vi.fn();

const demo: AppModule = {
  id: 'demo',
  label: 'Demo',
  basePath: '/demo',
  routes: [
    { id: 'lista', path: '', component: Lista, auth: 'public', title: 'Lista' },
    {
      id: 'tarea',
      path: 'tarea',
      component: () => <h1>Tarea</h1>,
      auth: 'public',
      title: 'Tarea',
      chrome: 'task',
    },
  ],
  useNav: () => [{ id: 'lista', to: '/demo', label: 'Lista', end: true }],
};

const tool: HostTool = { id: 'test-notes', enabled: true, Component: TestNotes };

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <HostApp modules={[demo]} tools={[tool]} />
    </MemoryRouter>,
  );
}

function nota(over: Partial<TestNote> = {}): TestNote {
  return {
    id: 1,
    user_id: 1,
    autor: 'ana@test.com',
    tipo: 'error',
    estado: 'abierta',
    texto: 'Se ve mal',
    ruta: '/demo',
    pantalla: 'Demo › Lista',
    selector: null,
    elemento: null,
    pos_x: null,
    pos_y: null,
    viewport_w: null,
    contexto: null,
    modo: [],
    respuesta: null,
    resuelta_at: null,
    created_at: '2026-10-18T12:00:00.000Z',
    updated_at: '2026-10-18T12:00:00.000Z',
    ...over,
  };
}

const marcar = () => fireEvent.click(screen.getByRole('button', { name: 'Marcar' }));
const abrirNotas = () => fireEvent.click(screen.getByRole('button', { name: /^Notas/ }));
const hoja = () => screen.getByRole('region', { name: 'Notas de prueba' });

function anchoVentana(px: number) {
  Object.defineProperty(window, 'innerWidth', { value: px, configurable: true, writable: true });
}

describe('TestNotes (ventana angosta: FABs y hoja inferior)', () => {
  beforeEach(() => {
    // En jsdom la columna mide 0: con 300 px quedan 268 libres < DOCK_MIN → sin panel lateral
    anchoVentana(300);
    auth.signedIn = true;
    api.list.mockResolvedValue([]);
    api.create.mockReset();
    api.update.mockReset();
    api.remove.mockReset();
    agregado.mockReset();
    // jsdom no implementa elementsFromPoint
    document.elementsFromPoint = () => [];
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('sin sesión no muestra los botones', () => {
    auth.signedIn = false;
    renderAt('/demo');
    expect(screen.queryByRole('button', { name: 'Marcar' })).toBeNull();
    expect(document.querySelector('[data-test-notes]')).toBeNull();
  });

  it('se monta en la columna: su padre es el mismo que el de main', async () => {
    renderAt('/demo');
    await waitFor(() => expect(api.list).toHaveBeenCalled());
    const raiz = document.querySelector('[data-test-notes]');
    expect(raiz?.parentElement).toBe(screen.getByRole('main').parentElement);
  });

  it('en una ruta de tarea también están "Marcar" y "Notas"', () => {
    renderAt('/demo/tarea');
    expect(screen.getByRole('button', { name: 'Marcar' })).toBeDefined();
    expect(screen.getByRole('button', { name: /^Notas/ })).toBeDefined();
  });

  it('marcar sobre un botón: la app no recibe el clic y el borrador lo describe', () => {
    renderAt('/demo');
    const boton = screen.getByRole('button', { name: 'Agregar' });
    document.elementsFromPoint = () => [screen.getByTestId('test-notes-mark-layer'), boton];
    marcar();
    fireEvent.click(screen.getByTestId('test-notes-mark-layer'), { clientX: 10, clientY: 10 });
    expect(agregado).not.toHaveBeenCalled();
    expect(within(hoja()).getByText('Botón: "Agregar"')).toBeDefined();
    expect(within(hoja()).getByText(/Marcado:/)).toBeDefined();
  });

  it('Escape sale del marcado sin borrador', () => {
    renderAt('/demo');
    marcar();
    expect(screen.getByText('Tocá donde está el problema')).toBeDefined();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('test-notes-mark-layer')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Notas de prueba' })).toBeNull();
  });

  it('nota sin marcar: envía la ruta y la pantalla, sin selector, y la muestra primera', async () => {
    api.create.mockResolvedValue(nota({ id: 9, texto: 'Falta un botón' }));
    renderAt('/demo');
    abrirNotas();
    fireEvent.click(within(hoja()).getByRole('button', { name: 'Nota sin marcar' }));
    const guardar = within(hoja()).getByRole('button', { name: 'Guardar nota' });
    expect((guardar as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(hoja()).getByLabelText('Texto de la nota'), {
      target: { value: 'Falta un botón' },
    });
    fireEvent.click(guardar);
    await waitFor(() => expect(screen.getByTestId('test-note-9')).toBeDefined());
    const enviado = api.create.mock.calls[0]?.[0];
    expect(enviado).toMatchObject({ ruta: '/demo', pantalla: 'Demo › Lista', texto: 'Falta un botón' });
    expect(enviado).not.toHaveProperty('selector');
    expect(enviado.contexto).toHaveProperty('userAgent');
  });

  it('un error al guardar se muestra y conserva el borrador', async () => {
    api.create.mockRejectedValue(new Error('400 {"error":"texto demasiado largo"}'));
    renderAt('/demo');
    abrirNotas();
    fireEvent.click(within(hoja()).getByRole('button', { name: 'Nota sin marcar' }));
    fireEvent.change(within(hoja()).getByLabelText('Texto de la nota'), {
      target: { value: 'Algo' },
    });
    fireEvent.click(within(hoja()).getByRole('button', { name: 'Guardar nota' }));
    await waitFor(() => expect(within(hoja()).getByRole('alert').textContent).toBe('texto demasiado largo'));
    expect((within(hoja()).getByLabelText('Texto de la nota') as HTMLTextAreaElement).value).toBe(
      'Algo',
    );
  });

  it('elemento desaparecido: pin en la posición guardada con aviso de aproximada', async () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const alto = this.tagName === 'MAIN' ? 600 : 0;
      return { top: 0, left: 0, right: 400, bottom: alto, width: 400, height: alto, x: 0, y: 0, toJSON: () => ({}) };
    });
    api.list.mockResolvedValue([
      nota({ id: 4, selector: '[data-testid="ya-no-esta"]', pos_x: 0.5, pos_y: 100 }),
    ]);
    renderAt('/demo');
    const pin = await screen.findByRole('button', { name: 'Nota #4, posición aproximada' });
    expect(pin.textContent).toBe('4');
  });

  it('Confirmar pasa la nota a corregida y sale de "Para revisar"', async () => {
    api.list.mockResolvedValue([nota({ id: 5, estado: 'para_revisar' })]);
    api.update.mockResolvedValue(nota({ id: 5, estado: 'corregida' }));
    renderAt('/demo');
    await waitFor(() => expect(api.list).toHaveBeenCalled());
    abrirNotas();
    fireEvent.click(within(hoja()).getByRole('button', { name: /^Para revisar/ }));
    const card = await within(hoja()).findByTestId('test-note-5');
    fireEvent.click(within(card).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(within(hoja()).queryByTestId('test-note-5')).toBeNull());
    expect(api.update).toHaveBeenCalledWith(5, { estado: 'corregida' });
  });

  it('Borrar pide confirmación: "No" deja la nota', async () => {
    api.list.mockResolvedValue([nota({ id: 6 })]);
    renderAt('/demo');
    await waitFor(() => expect(api.list).toHaveBeenCalled());
    abrirNotas();
    const card = await within(hoja()).findByTestId('test-note-6');
    fireEvent.click(within(card).getByRole('button', { name: 'Borrar' }));
    fireEvent.click(within(card).getByRole('button', { name: 'No' }));
    expect(api.remove).not.toHaveBeenCalled();
    expect(within(hoja()).getByTestId('test-note-6')).toBeDefined();
  });

  it('la tarjeta muestra el autor (notas compartidas)', async () => {
    api.list.mockResolvedValue([nota({ id: 7, autor: 'beto@test.com' })]);
    renderAt('/demo');
    await waitFor(() => expect(api.list).toHaveBeenCalled());
    abrirNotas();
    const card = await within(hoja()).findByTestId('test-note-7');
    expect(within(card).getByText(/beto@test\.com/)).toBeDefined();
  });

  it('recarga el listado cada 60 s', async () => {
    vi.useFakeTimers();
    try {
      renderAt('/demo');
      expect(api.list).toHaveBeenCalledTimes(1);
      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });
      expect(api.list).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('TestNotes (desktop: panel lateral fuera de la app)', () => {
  beforeEach(() => {
    anchoVentana(1440);
    auth.signedIn = true;
    api.list.mockResolvedValue([]);
    api.create.mockReset();
    agregado.mockReset();
    document.elementsFromPoint = () => [];
    // Columna de 480 px pegada a la izquierda: libre a la derecha = 1440 - 480 - 32
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const ancho = this.tagName === 'DIV' && this.querySelector(':scope > main') ? 480 : 0;
      return { top: 0, left: 0, right: ancho, bottom: 800, width: ancho, height: 800, x: 0, y: 0, toJSON: () => ({}) };
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('el panel se ve sin abrirlo, afuera de la columna, y no hay botones flotantes', async () => {
    renderAt('/demo');
    const panel = await screen.findByRole('region', { name: 'Notas de prueba' });
    const columna = screen.getByRole('main').parentElement;
    expect(columna?.contains(panel)).toBe(false);
    expect(panel.style.left).toBe('496px');
    expect(within(panel).getByRole('button', { name: 'Marcar en pantalla' })).toBeDefined();
    expect(screen.queryByRole('button', { name: /^Notas/ })).toBeNull();
  });

  it('al marcar, el cartel va en el panel (no sobre la app) y el borrador queda en el panel', async () => {
    renderAt('/demo');
    const panel = await screen.findByRole('region', { name: 'Notas de prueba' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Marcar en pantalla' }));
    const capa = screen.getByTestId('test-notes-mark-layer');
    expect(within(capa).queryByText('Tocá donde está el problema')).toBeNull();
    expect(within(panel).getByText('Tocá donde está el problema')).toBeDefined();
    const boton = screen.getByRole('button', { name: 'Agregar' });
    document.elementsFromPoint = () => [capa, boton];
    fireEvent.click(capa, { clientX: 10, clientY: 10 });
    expect(agregado).not.toHaveBeenCalled();
    expect(within(panel).getByText('Botón: "Agregar"')).toBeDefined();
  });

  it('"Ir a la nota" deja el panel visible', async () => {
    api.list.mockResolvedValue([nota({ id: 3, ruta: '/demo/tarea', pantalla: 'Demo › Tarea' })]);
    renderAt('/demo');
    const panel = await screen.findByRole('region', { name: 'Notas de prueba' });
    fireEvent.click(within(panel).getByRole('checkbox', { name: 'Solo esta pantalla' }));
    fireEvent.click(await within(panel).findByRole('button', { name: 'Demo › Tarea' }));
    expect(await screen.findByRole('heading', { name: 'Tarea' })).toBeDefined();
    expect(screen.getByRole('region', { name: 'Notas de prueba' })).toBeDefined();
  });
});
