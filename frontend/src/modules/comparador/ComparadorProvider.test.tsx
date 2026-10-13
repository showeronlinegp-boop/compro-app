import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { type ReactNode, StrictMode } from 'react';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useNavigationType,
} from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HostApp } from '../../host/HostApp';
import {
  type ComparadorContextValue,
  ComparadorProvider,
  useComparador,
} from './ComparadorProvider';
import { comparador } from './index';
import type {
  EnrichStatus,
  Interest,
  Product,
  ShoppingItem,
  SyncLog,
  UserProfile,
} from './types/api';
import { useNav } from './useNav';

// ---------------------------------------------------------------------------
// Clerk mockeado (patrón del smoke test) con la sesión conmutable por test.
// ---------------------------------------------------------------------------
const auth = vi.hoisted(() => ({ signedIn: true }));

vi.mock('@clerk/clerk-react', () => ({
  SignedIn: ({ children }: { children: ReactNode }) => (auth.signedIn ? children : null),
  SignedOut: ({ children }: { children: ReactNode }) => (auth.signedIn ? null : children),
  RedirectToSignIn: () => <div data-testid="redirect-sign-in" />,
  UserButton: () => null,
  SignInButton: ({ children }: { children: ReactNode }) => children,
  SignIn: () => null,
  SignUp: () => null,
  useAuth: () => ({ isSignedIn: auth.signedIn, getToken: async () => 'test-token' }),
  useClerk: () => ({ redirectToSignIn: () => Promise.resolve() }),
}));

// ---------------------------------------------------------------------------
// API del módulo mockeada. Lo que no se declara explícitamente devuelve `[]`.
// ---------------------------------------------------------------------------
const m = vi.hoisted(() => ({
  syncStatus: vi.fn(),
  enrichStatus: vi.fn(),
  promosList: vi.fn(),
  interestsList: vi.fn(),
  interestsAdd: vi.fn(),
  shoppingList: vi.fn(),
  shoppingAdd: vi.fn(),
  profileGet: vi.fn(),
  cartGet: vi.fn(),
}));

vi.mock('./api', () => {
  const fallback = () => Promise.resolve([]);
  const group = (explicit: Record<string, unknown>) =>
    new Proxy(explicit, { get: (t, k: string) => (k in t ? t[k] : fallback) });
  return {
    api: new Proxy(
      {
        sync: group({ status: m.syncStatus }),
        enrich: group({ status: m.enrichStatus }),
        promos: group({ list: m.promosList }),
        interests: group({ list: m.interestsList, add: m.interestsAdd }),
        shopping: group({ list: m.shoppingList, add: m.shoppingAdd }),
        profile: group({ get: m.profileGet }),
        cart: group({ get: m.cartGet }),
        products: group({
          groups: () => Promise.resolve({ data: [], total: 0, page: 1, pages: 1 }),
        }),
      } as Record<string, unknown>,
      { get: (t, k: string) => (k in t ? t[k] : group({})) },
    ),
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const product = (id: number) => ({ id, name: `P${id}` }) as unknown as Product;
const interest = (id: number) => ({ id, interest_id: 100 + id }) as unknown as Interest;
const shoppingItem = (id: number) => ({ id, shopping_id: 200 + id }) as unknown as ShoppingItem;
const profile = (onboarding_done: boolean) =>
  ({ id: 1, onboarding_done }) as unknown as UserProfile;
const syncLog = (status: SyncLog['status']) => ({ super: 'coto', status }) as unknown as SyncLog;
const enrich = (running: boolean, updated = 0): Record<string, EnrichStatus> => ({
  coto: { total: 10, done: running ? 3 : 10, updated, running, error: null, startedAt: '' },
});

// ---------------------------------------------------------------------------
// Sondas: muestran ubicación, tipo de navegación, nav del módulo y banner.
// ---------------------------------------------------------------------------
let ctx: ComparadorContextValue;
let navigateTo: ReturnType<typeof useNavigate>;

function Probe() {
  ctx = useComparador();
  navigateTo = useNavigate();
  const loc = useLocation();
  const navType = useNavigationType();
  const nav = useNav();
  return (
    <>
      <div data-testid="where">{loc.pathname + loc.search}</div>
      <div data-testid="nav-type">{navType}</div>
      <ul data-testid="nav">
        {nav.map((i) => (
          <li key={i.id} data-to={i.to}>
            {i.badge ? `${i.label} (${i.badge})` : i.label}
          </li>
        ))}
      </ul>
      <div data-testid="enrich-done">{ctx.enrichDone.join(',')}</div>
    </>
  );
}

function renderProvider(entries: string[], { strict = false } = {}) {
  const tree = (
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <ComparadorProvider>
        <Routes>
          <Route path="*" element={<Probe />} />
        </Routes>
      </ComparadorProvider>
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

/** Vacía las promesas pendientes (las respuestas mockeadas) dentro de act. */
const flush = () => act(async () => {});
const where = () => screen.getByTestId('where').textContent;
const navTexts = () =>
  Array.from(screen.getByTestId('nav').querySelectorAll('li')).map((li) => li.textContent);

beforeEach(() => {
  auth.signedIn = true;
  localStorage.clear();
  m.syncStatus.mockResolvedValue([]);
  m.enrichStatus.mockResolvedValue({});
  m.promosList.mockResolvedValue([]);
  m.interestsList.mockResolvedValue([]);
  m.interestsAdd.mockResolvedValue({ id: 1, product_id: 1 });
  m.shoppingList.mockResolvedValue([]);
  m.shoppingAdd.mockResolvedValue({ id: 1, product_id: 1 });
  m.profileGet.mockResolvedValue(profile(true));
  m.cartGet.mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// C3 — Redirección a onboarding
// ---------------------------------------------------------------------------
describe('C3 — redirección a onboarding', () => {
  it('profile sin onboarding y sin skip → /onboarding con replace (sin entrada nueva en el historial)', async () => {
    m.profileGet.mockResolvedValue(profile(false));
    renderProvider(['/', '/intereses']);
    await flush();
    expect(where()).toBe('/onboarding');
    expect(screen.getByTestId('nav-type').textContent).toBe('REPLACE');
    // Volver atrás saltea /intereses: /onboarding la reemplazó.
    await act(async () => navigateTo(-1));
    expect(where()).toBe('/');
  });

  it("respeta localStorage.onboarding_skipped = '1'", async () => {
    localStorage.setItem('onboarding_skipped', '1');
    m.profileGet.mockResolvedValue(profile(false));
    renderProvider(['/intereses']);
    await flush();
    expect(where()).toBe('/intereses');
    expect(screen.getByTestId('nav-type').textContent).toBe('POP');
  });

  it('ya en /onboarding no navega', async () => {
    m.profileGet.mockResolvedValue(profile(false));
    renderProvider(['/onboarding']);
    await flush();
    expect(where()).toBe('/onboarding');
    expect(screen.getByTestId('nav-type').textContent).toBe('POP');
  });

  it('en una ruta de otro módulo (/fiado) no redirige', async () => {
    m.profileGet.mockResolvedValue(profile(false));
    renderProvider(['/fiado/clientes']);
    await flush();
    expect(where()).toBe('/fiado/clientes');
    expect(screen.getByTestId('nav-type').textContent).toBe('POP');
  });

  it('profile null (sin perfil todavía) también redirige', async () => {
    m.profileGet.mockResolvedValue(null);
    renderProvider(['/planner']);
    await flush();
    expect(where()).toBe('/onboarding');
  });

  it('onboarding completo no redirige', async () => {
    renderProvider(['/intereses']);
    await flush();
    expect(where()).toBe('/intereses');
  });

  it('sin sesión no pide datos de usuario ni redirige', async () => {
    auth.signedIn = false;
    renderProvider(['/']);
    await flush();
    expect(m.profileGet).not.toHaveBeenCalled();
    expect(m.interestsList).not.toHaveBeenCalled();
    expect(m.shoppingList).not.toHaveBeenCalled();
    expect(where()).toBe('/');
  });
});

// ---------------------------------------------------------------------------
// C2 — Nav decidida por el módulo
// ---------------------------------------------------------------------------
describe('C2 — useNav', () => {
  it('con onboarding_done incluye Comparar → /compare al final', async () => {
    renderProvider(['/']);
    await flush();
    const items = screen.getByTestId('nav').querySelectorAll('li');
    expect(Array.from(items).map((li) => li.dataset.to)).toEqual([
      '/',
      '/intereses',
      '/planner',
      '/compare',
    ]);
    expect(navTexts()[3]).toBe('Comparar');
  });

  it('sin Comparar con onboarding pendiente (skip) o profile sin cargar (sin sesión)', async () => {
    localStorage.setItem('onboarding_skipped', '1');
    m.profileGet.mockResolvedValue(profile(false));
    renderProvider(['/']);
    await flush();
    expect(navTexts()).not.toContain('Comparar');
    cleanup();

    auth.signedIn = false;
    renderProvider(['/']);
    await flush();
    expect(ctx.profile).toBeUndefined();
    expect(navTexts()).toEqual(['Explorar', 'Intereses', 'Planner']);
  });

  it('contadores: 3 intereses y 0 en shopping → "Intereses (3)" y Planner sin contador', async () => {
    m.interestsList.mockResolvedValue([interest(1), interest(2), interest(3)]);
    renderProvider(['/']);
    await flush();
    expect(navTexts().slice(0, 3)).toEqual(['Explorar', 'Intereses (3)', 'Planner']);
  });

  it('contador de Planner con items en shopping', async () => {
    m.shoppingList.mockResolvedValue([shoppingItem(1), shoppingItem(2)]);
    renderProvider(['/']);
    await flush();
    expect(navTexts()[2]).toBe('Planner (2)');
  });

  it('Explorar recuerda la búsqueda: de /?q=leche a /planner apunta a /?q=leche', async () => {
    renderProvider(['/?q=leche']);
    await flush();
    await act(async () => navigateTo('/planner'));
    expect(where()).toBe('/planner');
    expect(screen.getByTestId('nav').querySelector('li')?.dataset.to).toBe('/?q=leche');
  });

  it('host + comparador: barra con 3 items + "Más", y Comparar en la pantalla "Más"', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <HostApp modules={[comparador]} />
      </MemoryRouter>,
    );
    await flush();
    const bottom = screen.getByRole('navigation', { name: 'Navegación inferior' });
    expect(
      within(bottom)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href')),
    ).toEqual(['/', '/intereses', '/planner', '/mas']);

    fireEvent.click(within(bottom).getByRole('link', { name: 'Más' }));
    await flush();
    expect(screen.getByRole('heading', { name: 'Más' })).toBeTruthy();
    // Comparar (4.º item) se lista en "Más" bajo el nombre del módulo.
    const section = screen.getByRole('heading', { name: 'Comparador' }).closest('section');
    expect(within(section as HTMLElement).getByRole('button', { name: 'Comparar' })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// C4 — Acción sin sesión
// ---------------------------------------------------------------------------
describe('C4 — acciones sin sesión', () => {
  it('toggleInterest sin sesión → /sign-in sin llamar a la API', async () => {
    auth.signedIn = false;
    renderProvider(['/']);
    await flush();
    await act(() => ctx.toggleInterest(product(1)));
    expect(where()).toBe('/sign-in');
    expect(m.interestsAdd).not.toHaveBeenCalled();
  });

  it('addToShopping sin sesión → /sign-in sin llamar a la API', async () => {
    auth.signedIn = false;
    renderProvider(['/']);
    await flush();
    await act(() => ctx.addToShopping(product(1), 7));
    expect(where()).toBe('/sign-in');
    expect(m.shoppingAdd).not.toHaveBeenCalled();
  });

  it('toggleInterest con sesión agrega y recarga la lista', async () => {
    renderProvider(['/']);
    await flush();
    m.interestsList.mockResolvedValue([interest(1)]);
    await act(() => ctx.toggleInterest(product(1)));
    expect(m.interestsAdd).toHaveBeenCalledWith(1);
    expect(ctx.interests).toHaveLength(1);
    expect(where()).toBe('/');
  });
});

// ---------------------------------------------------------------------------
// C5 — Polling de sync/enrich (fake timers)
// ---------------------------------------------------------------------------
describe('C5 — polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('sin sync ni enrich corriendo no hay timers', async () => {
    renderProvider(['/']);
    await flush();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('sync corriendo: consulta cada 3 s y deja de hacerlo al terminar', async () => {
    m.syncStatus.mockResolvedValue([syncLog('running')]);
    renderProvider(['/']);
    await flush();
    expect(m.syncStatus).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);

    await act(() => vi.advanceTimersByTimeAsync(2999));
    expect(m.syncStatus).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(m.syncStatus).toHaveBeenCalledTimes(2);

    m.syncStatus.mockResolvedValue([syncLog('ok')]);
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(m.syncStatus).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);

    await act(() => vi.advanceTimersByTimeAsync(9000));
    expect(m.syncStatus).toHaveBeenCalledTimes(3);
  });

  it('enrich corriendo: consulta cada 3 s; al terminar muestra el banner 8 s y lo oculta', async () => {
    m.enrichStatus.mockResolvedValue(enrich(true));
    renderProvider(['/']);
    await flush();
    expect(vi.getTimerCount()).toBe(1);

    m.enrichStatus.mockResolvedValue(enrich(false, 5));
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(m.enrichStatus).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('enrich-done').textContent).toBe('coto');
    // El interval se limpió; queda sólo el timeout del banner.
    expect(vi.getTimerCount()).toBe(1);

    await act(() => vi.advanceTimersByTimeAsync(7999));
    expect(screen.getByTestId('enrich-done').textContent).toBe('coto');
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByTestId('enrich-done').textContent).toBe('');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('enrich terminado en una carga fresca (sin running observado) no muestra banner', async () => {
    m.enrichStatus.mockResolvedValue(enrich(false, 5));
    renderProvider(['/']);
    await flush();
    expect(screen.getByTestId('enrich-done').textContent).toBe('');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('desmontar con sync y enrich corriendo no deja timers', async () => {
    m.syncStatus.mockResolvedValue([syncLog('running')]);
    m.enrichStatus.mockResolvedValue(enrich(true));
    const { unmount } = renderProvider(['/']);
    await flush();
    expect(vi.getTimerCount()).toBe(2);
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(vi.getTimerCount()).toBe(2);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
    await act(() => vi.advanceTimersByTimeAsync(9000));
    expect(m.syncStatus).toHaveBeenCalledTimes(2);
  });

  it('StrictMode no duplica los intervals', async () => {
    m.syncStatus.mockResolvedValue([syncLog('running')]);
    m.enrichStatus.mockResolvedValue(enrich(true));
    const { unmount } = renderProvider(['/'], { strict: true });
    await flush();
    expect(vi.getTimerCount()).toBe(2);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Integración host + comparador real (H1, C4)
// ---------------------------------------------------------------------------
describe('host + comparador', () => {
  const renderHost = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <HostApp modules={[comparador]} />
      </MemoryRouter>,
    );

  it('H1: "/" sin sesión muestra header, nav y Explorar, sin redirección', async () => {
    auth.signedIn = false;
    renderHost('/');
    await flush();
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Navegación inferior' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Explorar productos' })).toBeTruthy();
    expect(screen.queryByTestId('redirect-sign-in')).toBeNull();
  });

  it('H1: "/planner" sin sesión → sign-in de Clerk', async () => {
    auth.signedIn = false;
    renderHost('/planner');
    await flush();
    expect(screen.getByTestId('redirect-sign-in')).toBeTruthy();
  });

  it('C4: header en orden marca, carrito, ubicación, sync y cuenta', async () => {
    auth.signedIn = false;
    renderHost('/');
    await flush();
    const header = screen.getByRole('banner');
    const buttons = within(header).getAllByRole('button');
    expect(buttons.map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual([
      'Carrito',
      '📍 Elegí tu zona',
      '⚡ Estado',
      'Ingresar',
    ]);
    // La marca del host va antes que las acciones del módulo.
    const brand = within(header).getByText('Neggo');
    expect(
      brand.compareDocumentPosition(buttons[0] as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
