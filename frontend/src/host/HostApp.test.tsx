import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { type ReactNode, createContext, useContext, useEffect } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HostApp } from './HostApp';
import type { AppModule, HostTool, NavItem } from './contract';
import { useHostLocation } from './location';

// ---------------------------------------------------------------------------
// Clerk mockeado como en el smoke test, con la sesión conmutable por test.
// ---------------------------------------------------------------------------
const auth = vi.hoisted(() => ({ signedIn: true }));

vi.mock('@clerk/clerk-react', () => ({
  SignedIn: ({ children }: { children: ReactNode }) => (auth.signedIn ? children : null),
  SignedOut: ({ children }: { children: ReactNode }) => (auth.signedIn ? null : children),
  RedirectToSignIn: () => <div data-testid="redirect-sign-in" />,
  UserButton: () => null,
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
  </>
);
const PrivadaPage = () => <h1>Privada</h1>;

const demoNav: NavItem[] = [
  { id: 'demo', to: '/demo', label: 'Demo', icon: '🧪', end: true },
  { id: 'privada', to: '/demo/privada?tab=1', label: 'Privada', icon: '🔒', badge: 2 },
  {
    id: 'svg',
    to: '/demo/svg',
    label: 'Svg',
    icon: <svg data-testid="svg-icon" />,
    iconInTop: true,
  },
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
const topNav = () => screen.getByRole('navigation', { name: 'Principal' });

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
    expect(screen.queryByRole('navigation', { name: 'Principal' })).toBeNull();
  });

  it('H3: un módulo sin useNav no aporta items y no rompe', () => {
    renderAt('/bare', [bare]);
    expect(screen.getByRole('heading', { name: 'Bare' })).toBeDefined();
    expect(within(topNav()).queryAllByRole('link')).toHaveLength(0);
    const bottom = bottomNav();
    expect(bottom).not.toBeNull();
    expect(within(bottom as HTMLElement).queryAllByRole('link')).toHaveLength(0);
  });

  it('H3: top y bottom muestran los mismos items, en el mismo orden y con los mismos to', () => {
    renderAt('/demo');
    const hrefs = (el: HTMLElement) =>
      within(el)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href'));
    const top = hrefs(topNav());
    expect(top).toEqual(['/demo', '/demo/privada?tab=1', '/demo/svg']);
    expect(hrefs(bottomNav() as HTMLElement)).toEqual(top);
  });

  it('H3: texto top con topLabel y bottom con ícono + label; ícono no-string en span aria-hidden', () => {
    renderAt('/demo');
    const topLinks = within(topNav()).getAllByRole('link');
    expect(topLinks.map((a) => a.textContent)).toEqual(['Demo', 'Privada (2)', 'Svg']);
    const svgSpan = within(topNav()).getByTestId('svg-icon').parentElement;
    expect(svgSpan?.tagName).toBe('SPAN');
    expect(svgSpan?.getAttribute('aria-hidden')).toBe('true');

    const bottomLinks = within(bottomNav() as HTMLElement).getAllByRole('link');
    expect(bottomLinks[0]?.textContent).toBe('🧪Demo');
    expect(bottomLinks[1]?.textContent).toBe('🔒Privada');
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

  it('H4: los slots se renderizan dentro del Provider del módulo', () => {
    renderAt('/bare');
    expect(screen.getByTestId('slot').textContent).toBe('valor-del-provider');
    expect(screen.getByTestId('overlay')).toBeDefined();
  });

  it('H1: ruta desconocida → layout con main vacío', () => {
    renderAt('/no-existe');
    expect(topNav()).toBeDefined();
    const main = screen.getByRole('main');
    expect(main.innerHTML).toBe('');
  });

  it('H6: useHostLocation completa navItem cuyo to (sin search) matchea la ruta', () => {
    renderAt('/demo');
    expect(screen.getByTestId('probe').textContent).toBe('lista|demo');
  });

  it('H6: useHostLocation sin item de nav → navItem undefined', () => {
    renderAt('/demo/sin-nav');
    expect(screen.getByTestId('probe').textContent).toBe('sin-nav|sin-nav');
  });

  it('H7: con hostTools vacío no agrega markup después de la barra', () => {
    const { container } = renderAt('/demo');
    const shell = container.firstElementChild as HTMLElement;
    expect(shell.lastElementChild?.getAttribute('aria-label')).toBe('Navegación inferior');
  });

  describe('H8: chrome por ruta', () => {
    it("en /demo/anotar ('task') no hay barra inferior, el header sigue y la tool está montada", () => {
      renderAt('/demo/anotar', [demo, bare], [enabledTool]);
      expect(screen.getByRole('heading', { name: 'Anotar' })).toBeDefined();
      expect(bottomNav()).toBeNull();
      expect(topNav()).toBeDefined();
      expect(screen.getByText('🛒 COMPRO')).toBeDefined();
      expect(screen.getByTestId('slot')).toBeDefined();
      expect(screen.getByTestId('overlay')).toBeDefined();
      expect(screen.getByTestId('host-tool')).toBeDefined();
      expect(screen.getByRole('main').className).toBe('flex-1');
    });

    it('en /demo (sin chrome) la barra está y main reserva su espacio', () => {
      renderAt('/demo');
      expect(bottomNav()).not.toBeNull();
      expect(screen.getByRole('main').className).toBe('flex-1 pb-16 lg:pb-0');
    });

    it('en /no-existe la barra está (full)', () => {
      renderAt('/no-existe');
      expect(bottomNav()).not.toBeNull();
    });

    it('volver de /demo/anotar a /demo restaura la barra sin remontar el Provider', () => {
      renderAt('/demo/anotar');
      expect(bottomNav()).toBeNull();
      expect(providerMounts).toHaveBeenCalledTimes(1);

      fireEvent.click(within(topNav()).getByRole('link', { name: 'Demo' }));

      expect(screen.getByRole('heading', { name: 'Página demo' })).toBeDefined();
      expect(bottomNav()).not.toBeNull();
      expect(providerMounts).toHaveBeenCalledTimes(1);
    });
  });
});
