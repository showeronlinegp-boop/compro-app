import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { type ReactNode, createContext, useContext, useEffect } from 'react';
import { Link, MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HostApp } from './HostApp';
import type { AppModule, HostTool, NavItem } from './contract';
import { useHostLocation } from './location';
import { useToast } from './ui/Toast';

// ---------------------------------------------------------------------------
// Clerk mockeado como en el smoke test, con la sesión conmutable por test.
// ---------------------------------------------------------------------------
const auth = vi.hoisted(() => ({ signedIn: true }));

vi.mock('@clerk/clerk-react', () => ({
  SignedIn: ({ children }: { children: ReactNode }) => (auth.signedIn ? children : null),
  SignedOut: ({ children }: { children: ReactNode }) => (auth.signedIn ? null : children),
  RedirectToSignIn: () => <div data-testid="redirect-sign-in" />,
  UserButton: () => null,
  SignOutButton: ({ children }: { children: ReactNode }) => children,
  SignInButton: ({ children }: { children: ReactNode }) => children,
  SignIn: () => <div data-testid="clerk-sign-in" />,
  SignUp: () => null,
}));

// ---------------------------------------------------------------------------
// Módulos falsos
// ---------------------------------------------------------------------------
const DemoContext = createContext<string | null>(null);
const providerMounts = vi.fn();

function DemoProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    providerMounts();
  }, []);
  return <DemoContext.Provider value="valor-del-provider">{children}</DemoContext.Provider>;
}

function DemoHeaderActions() {
  return <span data-testid="slot">{useContext(DemoContext)}</span>;
}

function DemoOverlay() {
  return <div data-testid="overlay" />;
}

/** Muestra lo que resuelve useHostLocation dentro del layout. */
function LocationProbe() {
  const loc = useHostLocation();
  return (
    <div data-testid="probe">
      {loc ? `${loc.route.id}|${loc.navItem?.id ?? 'sin-nav'}` : 'null'}
    </div>
  );
}

const DemoPage = () => (
  <>
    <h1>Página demo</h1>
    <LocationProbe />
  </>
);
const AnotarPage = () => (
  <>
    <h1>Anotar</h1>
    <LocationProbe />
    <Link to="/demo">Ir a demo</Link>
  </>
);
const PrivadaPage = () => <h1>Privada</h1>;

const demoNav: NavItem[] = [
  { id: 'demo', to: '/demo', label: 'Demo', icon: '🧪', end: true },
  { id: 'privada', to: '/demo/privada?tab=1', label: 'Privada', icon: '🔒', badge: 2 },
  { id: 'svg', to: '/demo/svg', label: 'Svg', icon: <svg data-testid="svg-icon" /> },
];

const demo: AppModule = {
  id: 'demo',
  label: 'Demo',
  basePath: '/demo',
  routes: [
    { id: 'lista', path: '', component: DemoPage, auth: 'public', title: 'Demo' },
    {
      id: 'anotar',
      path: 'anotar',
      component: AnotarPage,
      auth: 'public',
      title: 'Anotar',
      chrome: 'task',
    },
    { id: 'privada', path: 'privada', component: PrivadaPage, auth: 'required', title: 'Privada' },
    { id: 'sin-nav', path: 'sin-nav', component: LocationProbe, auth: 'public', title: 'Sin nav' },
  ],
  Provider: DemoProvider,
  useNav: () => demoNav,
  slots: { headerActions: DemoHeaderActions, overlays: DemoOverlay },
};

/** Módulo sin useNav, sin Provider y sin slots. */
const bare: AppModule = {
  id: 'bare',
  label: 'Bare',
  basePath: '/bare',
  routes: [{ id: 'home', path: '', component: () => <h1>Bare</h1>, auth: 'public', title: 'Bare' }],
};

/** Módulo con 4 items: el 4.º va a "Más". */
const wide: AppModule = {
  id: 'wide',
  label: 'Ancho',
  basePath: '/wide',
  routes: [
    { id: 'uno', path: '', component: () => <h1>Uno</h1>, auth: 'public', title: 'Uno' },
    {
      id: 'cuatro',
      path: 'cuatro',
      component: () => <h1>Cuatro</h1>,
      auth: 'public',
      title: 'Cuatro',
    },
  ],
  useNav: () => [
    { id: 'uno', to: '/wide', label: 'Uno', end: true },
    { id: 'dos', to: '/wide/dos', label: 'Dos' },
    { id: 'tres', to: '/wide/tres', label: 'Tres' },
    { id: 'cuatro', to: '/wide/cuatro', label: 'Cuatro' },
  ],
};

const Tool = () => <div data-testid="host-tool" />;
const enabledTool: HostTool = { id: 'tool', enabled: true, Component: Tool };

function renderAt(path: string, modules: AppModule[] = [demo, bare], tools?: HostTool[]) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <HostApp modules={modules} tools={tools} />
    </MemoryRouter>,
  );
}

const bottomNav = () => screen.queryByRole('navigation', { name: 'Navegación inferior' });
const hrefs = (el: HTMLElement) =>
  within(el)
    .getAllByRole('link')
    .map((a) => a.getAttribute('href'));

describe('HostApp', () => {
  beforeEach(() => {
    auth.signedIn = true;
    providerMounts.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('H2: monta la ruta de un módulo falso en /demo', () => {
    renderAt('/demo');
    expect(screen.getByRole('heading', { name: 'Página demo' })).toBeDefined();
  });

  it('H1: las rutas de Clerk quedan fuera del layout', () => {
    renderAt('/sign-in/factor-one');
    expect(screen.getByTestId('clerk-sign-in')).toBeDefined();
    expect(bottomNav()).toBeNull();
    expect(screen.queryByRole('main')).toBeNull();
  });

  it('H3: un módulo sin useNav no aporta items: la barra sólo tiene "Más"', () => {
    renderAt('/bare', [bare]);
    expect(screen.getByRole('heading', { name: 'Bare' })).toBeDefined();
    expect(hrefs(bottomNav() as HTMLElement)).toEqual(['/mas']);
  });

  it('H3: la barra muestra los items del módulo activo, en orden, más "Más"', () => {
    renderAt('/demo');
    expect(hrefs(bottomNav() as HTMLElement)).toEqual([
      '/demo',
      '/demo/privada?tab=1',
      '/demo/svg',
      '/mas',
    ]);
  });

  it('H3: en una ruta de otro módulo la barra no mezcla items de demo', () => {
    renderAt('/bare');
    expect(hrefs(bottomNav() as HTMLElement)).toEqual(['/mas']);
  });

  it('H3: ícono en span aria-hidden y contador accesible en el texto', () => {
    renderAt('/demo');
    const nav = bottomNav() as HTMLElement;
    const svgSpan = within(nav).getByTestId('svg-icon').parentElement;
    expect(svgSpan?.tagName).toBe('SPAN');
    expect(svgSpan?.getAttribute('aria-hidden')).toBe('true');
    expect(within(nav).getByRole('link', { name: /Privada \(2\)/ })).toBeDefined();
    expect(within(nav).getByRole('link', { name: 'Más' })).toBeDefined();
  });

  it('nav: con 4 items van 3 a la barra y el 4.º aparece en "Más"', () => {
    renderAt('/wide', [wide]);
    expect(hrefs(bottomNav() as HTMLElement)).toEqual(['/wide', '/wide/dos', '/wide/tres', '/mas']);

    fireEvent.click(within(bottomNav() as HTMLElement).getByRole('link', { name: 'Más' }));
    expect(screen.getByRole('heading', { name: 'Más' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Cuatro' }));
    expect(screen.getByRole('heading', { name: 'Cuatro' })).toBeDefined();
  });

  it('Más: con varios módulos lista las herramientas y marca la activa', () => {
    renderAt('/demo');
    fireEvent.click(within(bottomNav() as HTMLElement).getByRole('link', { name: 'Más' }));
    const tools = screen.getByRole('heading', { name: 'Herramientas' }).closest('section');
    expect(
      within(tools as HTMLElement).getByRole('button', { name: /Demo/ }).textContent,
    ).toContain('Estás acá');
    // La barra sigue mostrando el módulo de donde vino el usuario.
    expect(hrefs(bottomNav() as HTMLElement)).toContain('/demo/svg');

    fireEvent.click(within(tools as HTMLElement).getByRole('button', { name: 'Bare' }));
    expect(screen.getByRole('heading', { name: 'Bare' })).toBeDefined();
  });

  it('Más: con sesión ofrece Cerrar sesión a la vista', () => {
    renderAt('/mas');
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Ingresar' })).toBeNull();
  });

  it('Más: sin sesión ofrece Ingresar', () => {
    auth.signedIn = false;
    renderAt('/mas');
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).toBeNull();
  });

  it('H1: ruta required sin sesión → RedirectToSignIn', () => {
    auth.signedIn = false;
    renderAt('/demo/privada');
    expect(screen.getByTestId('redirect-sign-in')).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Privada' })).toBeNull();
  });

  it('H1: ruta required con sesión → renderiza la página dentro del layout', () => {
    renderAt('/demo/privada');
    expect(screen.getByRole('heading', { name: 'Privada' })).toBeDefined();
    expect(screen.queryByTestId('redirect-sign-in')).toBeNull();
  });

  it('H4: headerActions sólo en rutas de su módulo y dentro de su Provider', () => {
    renderAt('/demo');
    const banner = screen.getByRole('banner');
    expect(within(banner).getByText('Neggo')).toBeDefined();
    expect(within(banner).getByTestId('slot').textContent).toBe('valor-del-provider');
    cleanup();

    renderAt('/bare');
    expect(screen.queryByRole('banner')).toBeNull();
    expect(screen.queryByTestId('slot')).toBeNull();
  });

  it('H4: los overlays se montan en todas las rutas', () => {
    renderAt('/bare');
    expect(screen.getByTestId('overlay')).toBeDefined();
  });

  it('privacidad: abre sin sesión, fuera del layout y con noindex', () => {
    auth.signedIn = false;
    renderAt('/privacidad');
    expect(screen.getByRole('heading', { name: 'Política de privacidad' })).toBeDefined();
    expect(screen.queryByTestId('redirect-sign-in')).toBeNull();
    expect(bottomNav()).toBeNull();
    expect(document.head.querySelector('meta[name="robots"][content="noindex"]')).not.toBeNull();
  });

  it('H1: ruta desconocida → layout con main vacío y barra', () => {
    renderAt('/no-existe');
    expect(screen.getByRole('main').innerHTML).toBe('');
    expect(bottomNav()).not.toBeNull();
  });

  it("sin módulo en '/', '/' redirige al primer módulo", () => {
    renderAt('/');
    expect(screen.getByRole('heading', { name: 'Página demo' })).toBeDefined();
  });

  it("con un módulo en '/', '/' no redirige", () => {
    const raiz: AppModule = { ...bare, id: 'raiz', basePath: '/' };
    renderAt('/', [demo, raiz]);
    expect(screen.getByRole('heading', { name: 'Bare' })).toBeDefined();
  });

  it('H6: useHostLocation completa navItem cuyo to (sin search) matchea la ruta', () => {
    renderAt('/demo');
    expect(screen.getByTestId('probe').textContent).toBe('lista|demo');
  });

  it('H6: useHostLocation sin item de nav → navItem undefined', () => {
    renderAt('/demo/sin-nav');
    expect(screen.getByTestId('probe').textContent).toBe('sin-nav|sin-nav');
  });

  it('H7: con hostTools vacío, lo último del shell es la región del toast', () => {
    const { container } = renderAt('/demo');
    const shell = container.firstElementChild as HTMLElement;
    expect(shell.lastElementChild?.getAttribute('data-testid')).toBe('toast-region');
  });

  describe('H8: chrome por ruta', () => {
    it("en /demo/anotar ('task') no hay barra inferior; header, overlays y tool siguen", () => {
      renderAt('/demo/anotar', [demo, bare], [enabledTool]);
      expect(screen.getByRole('heading', { name: 'Anotar' })).toBeDefined();
      expect(bottomNav()).toBeNull();
      expect(screen.getByRole('banner')).toBeDefined();
      expect(screen.getByTestId('slot')).toBeDefined();
      expect(screen.getByTestId('overlay')).toBeDefined();
      expect(screen.getByTestId('host-tool')).toBeDefined();
      // Sin barra, el toast flota a 20 px del borde.
      expect(screen.getByTestId('toast-region').className).toContain('bottom-5');
    });

    it('en /demo (sin chrome) la barra está', () => {
      renderAt('/demo');
      expect(bottomNav()).not.toBeNull();
    });

    it('volver de /demo/anotar a /demo restaura la barra sin remontar el Provider', () => {
      renderAt('/demo/anotar');
      expect(bottomNav()).toBeNull();
      expect(providerMounts).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole('link', { name: 'Ir a demo' }));

      expect(screen.getByRole('heading', { name: 'Página demo' })).toBeDefined();
      expect(bottomNav()).not.toBeNull();
      expect(providerMounts).toHaveBeenCalledTimes(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Toast global
// ---------------------------------------------------------------------------
const undo = vi.fn();

function ToastPage() {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() =>
        toast.show('Anotaste $ 4.200', { action: { label: 'Deshacer', onClick: undo } })
      }
    >
      Disparar
    </button>
  );
}

const toastModule: AppModule = {
  id: 'toast',
  label: 'Toast',
  basePath: '/t',
  routes: [{ id: 'p', path: '', component: ToastPage, auth: 'public', title: 'T' }],
};

describe('Toast del host', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    undo.mockClear();
  });

  it('muestra el mensaje, ejecuta la acción y se va solo a los 3 s', () => {
    vi.useFakeTimers();
    renderAt('/t', [toastModule]);

    fireEvent.click(screen.getByRole('button', { name: 'Disparar' }));
    const region = screen.getByTestId('toast-region');
    expect(screen.getByRole('status')).toBe(region);
    expect(region.textContent).toContain('Anotaste $ 4.200');
    // Con barra inferior flota a 90 px del borde.
    expect(region.className).toContain('bottom-[90px]');

    fireEvent.click(within(region).getByRole('button', { name: 'Deshacer' }));
    expect(undo).toHaveBeenCalledTimes(1);
    expect(region.textContent).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Disparar' }));
    expect(region.textContent).toContain('Anotaste');
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(region.textContent).toBe('');
  });
});
