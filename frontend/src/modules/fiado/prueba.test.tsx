import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HostApp } from '../../host/HostApp';
import { fiado } from './index';
import { clienteDePrueba, conMovimiento } from './prueba';

/** `sesion.activa` decide qué muestran SignedIn / SignedOut. */
const sesion = vi.hoisted(() => ({ activa: false }));

vi.mock('@clerk/clerk-react', () => ({
  SignedIn: ({ children }: { children: ReactNode }) => (sesion.activa ? children : null),
  SignedOut: ({ children }: { children: ReactNode }) => (sesion.activa ? null : children),
  RedirectToSignIn: () => <div>Ir al login</div>,
  UserButton: () => null,
  SignOutButton: ({ children }: { children: ReactNode }) => children,
  SignInButton: ({ children }: { children: ReactNode }) => children,
  SignIn: () => null,
  SignUp: () => <div>Crear cuenta en Clerk</div>,
}));

const m = vi.hoisted(() => ({
  resumen: vi.fn(),
  avisos: vi.fn(),
  ajustes: vi.fn(),
  anotar: vi.fn(),
  crearCliente: vi.fn(),
}));

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, fiadoApi: { ...actual.fiadoApi, ...m } };
});

function Donde() {
  const loc = useLocation();
  return <div data-testid="donde">{loc.pathname}</div>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <HostApp modules={[fiado]} />
      <Donde />
    </MemoryRouter>,
  );
}

const donde = () => screen.getByTestId('donde').textContent;
const barra = () => screen.queryByRole('navigation', { name: 'Navegación inferior' });

/** Toca las teclas del teclado numérico, una por una. */
function teclear(digitos: string) {
  for (const d of digitos) fireEvent.click(screen.getByRole('button', { name: d }));
}

beforeEach(() => {
  sesion.activa = false;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('datos de prueba', () => {
  it('un fiado suma y un pago resta; pagado todo, no cuenta días', () => {
    const marta = clienteDePrueba(1, 'Marta', 1000, 5);
    expect(conMovimiento(marta, 'fiado', 500).saldo).toBe(1500);
    const pagado = conMovimiento(marta, 'pago', 1000);
    expect(pagado.saldo).toBe(0);
    expect(pagado.dias_sin_pagar).toBeNull();
    expect(conMovimiento(pagado, 'fiado', 200).dias_sin_pagar).toBe(0);
  });
});

describe('Página pública de Fiado', () => {
  it('sin sesión, /fiado muestra la home en vez de mandar al login, sin barra inferior', () => {
    renderAt('/fiado');
    expect(screen.getByRole('heading', { level: 1, name: /sin cuaderno/ })).toBeTruthy();
    // El chat de ejemplo usa los mismos textos que la app: comprobante y recordatorio.
    const chat = screen.getByRole('figure');
    expect(chat.textContent).toContain('anoté $ 3.500 en tu cuenta de Kiosco Lu');
    expect(chat.textContent).toContain('te recuerdo que tenés un saldo de $ 12.300');
    expect(chat.textContent).toContain('Hecho con Neggo');
    expect(screen.getAllByRole('button', { name: 'Probala ahora' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Registrarme gratis' })).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Preguntas frecuentes' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Privacidad' }).getAttribute('href')).toBe(
      '/privacidad',
    );
    expect(screen.getByRole('link', { name: 'Términos' }).getAttribute('href')).toBe('/terminos');
    expect(screen.queryByText('Ir al login')).toBeNull();
    expect(barra()).toBeNull();
    expect(m.resumen).not.toHaveBeenCalled();
  });

  it('"Registrarme gratis" lleva al registro y "Ya tengo cuenta" al login', () => {
    renderAt('/fiado');
    const [crear] = screen.getAllByRole('button', { name: 'Registrarme gratis' });
    fireEvent.click(crear as HTMLElement);
    expect(donde()).toBe('/sign-up');
    cleanup();
    renderAt('/fiado');
    fireEvent.click(screen.getByRole('button', { name: 'Ya tengo cuenta' }));
    expect(donde()).toBe('/sign-in');
  });

  it('con sesión, /fiado sigue siendo el Inicio con su barra', async () => {
    sesion.activa = true;
    m.resumen.mockResolvedValue({
      total: 0,
      clientes_con_deuda: 0,
      clientes: 1,
      para_cobrar: [],
      ultimos: [],
    });
    m.ajustes.mockResolvedValue({ comercio: 'Kiosco Lu', recargo: null });
    m.avisos.mockResolvedValue({ vencidos: [], hoy: [], proximos: [], sin_recordar: 0 });
    renderAt('/fiado');
    await act(async () => {});
    expect(screen.queryByRole('button', { name: 'Probala ahora' })).toBeNull();
    expect(barra()).toBeTruthy();
  });

  it('las demás pantallas de Fiado siguen pidiendo sesión', () => {
    renderAt('/fiado/clientes');
    expect(screen.getByText('Ir al login')).toBeTruthy();
  });
});

describe('Modo prueba', () => {
  it('se llega desde la página pública y avisa que es una prueba', () => {
    renderAt('/fiado');
    const [probar] = screen.getAllByRole('button', { name: 'Probala ahora' });
    fireEvent.click(probar as HTMLElement);
    expect(donde()).toBe('/fiado/probar');
    expect(screen.getByText(/^Estás probando\. Para guardar tus clientes/)).toBeTruthy();
    expect(screen.getByText('Marta Giménez')).toBeTruthy();
    expect(barra()).toBeNull();
  });

  it('la guía lleva paso a paso: cliente, monto, anotar y comprobante', () => {
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null);
    renderAt('/fiado/probar');
    const guia = () => screen.getByRole('region', { name: 'Guía' }).textContent;

    expect(guia()).toContain('Paso 1 de 4');
    expect(guia()).toContain('Tocá a Marta Giménez');
    fireEvent.click(screen.getByText('Marta Giménez'));

    expect(screen.getByRole('heading', { name: 'Anotar fiado' })).toBeTruthy();
    expect(guia()).toContain('Paso 2 de 4');
    teclear('2000');
    expect(guia()).toContain('Paso 3 de 4');
    fireEvent.click(screen.getAllByRole('button', { name: 'Anotar fiado' }).at(-1) as HTMLElement);

    expect(screen.getByText('Anotaste $ 2.000 de fiado a Marta.')).toBeTruthy();
    expect(screen.getByText('$ 14.300')).toBeTruthy();
    const comprobante = screen.getByText(/anoté \$ 2\.000 en tu cuenta de Kiosco Lu/);
    expect(comprobante.textContent).toContain('Tu saldo es $ 14.300');
    expect(guia()).toContain('Paso 4 de 4');

    fireEvent.click(screen.getByRole('button', { name: 'Enviar por WhatsApp' }));
    expect(abrir).toHaveBeenCalledOnce();
    expect(String(abrir.mock.calls[0]?.[0])).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(screen.queryByRole('region', { name: 'Guía' })).toBeNull();

    // De vuelta en la libreta: el saldo quedó actualizado y la guía cierra.
    fireEvent.click(screen.getByRole('button', { name: 'Volver a la libreta' }));
    const marta = screen.getByRole('list', { name: 'Primer cliente de ejemplo' });
    expect(within(marta).getByText('$ 14.300')).toBeTruthy();
    expect(guia()).toContain('¡Ya sabés usarlo!');
    fireEvent.click(screen.getByRole('button', { name: 'Seguir probando' }));
    expect(screen.queryByRole('region', { name: 'Guía' })).toBeNull();

    expect(m.anotar).not.toHaveBeenCalled();
    expect(m.crearCliente).not.toHaveBeenCalled();
  });

  it('la guía se puede saltear', () => {
    renderAt('/fiado/probar');
    fireEvent.click(screen.getByRole('button', { name: 'Saltear la guía' }));
    expect(screen.queryByRole('region', { name: 'Guía' })).toBeNull();
    fireEvent.click(screen.getByText('Marta Giménez'));
    expect(screen.queryByRole('region', { name: 'Guía' })).toBeNull();
  });

  it('registrar un pago pide elegir el cliente y baja el saldo', () => {
    renderAt('/fiado/probar');
    fireEvent.click(screen.getByRole('button', { name: /Registrar pago/ }));
    const confirmar = () =>
      screen.getAllByRole('button', { name: 'Registrar pago' }).at(-1) as HTMLButtonElement;
    teclear('500');
    expect(confirmar().disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Don Carlos' }));
    fireEvent.click(confirmar());
    expect(screen.getByText('Don pagó $ 500.')).toBeTruthy();
    expect(screen.getByText('$ 4.000')).toBeTruthy();
  });

  it('"Crear cuenta" del aviso lleva al registro', () => {
    renderAt('/fiado/probar');
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(donde()).toBe('/sign-up');
  });
});
