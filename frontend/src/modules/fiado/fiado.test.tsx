import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HostApp } from '../../host/HostApp';
import type { Cliente, Ficha, Movimiento, Resumen } from './api';
import { fiado } from './index';
import { lineaCliente, textoDias, textoSaldo } from './textos';

vi.mock('@clerk/clerk-react', () => ({
  SignedIn: ({ children }: { children: ReactNode }) => children,
  SignedOut: () => null,
  RedirectToSignIn: () => null,
  UserButton: () => null,
  SignOutButton: ({ children }: { children: ReactNode }) => children,
  SignInButton: ({ children }: { children: ReactNode }) => children,
  SignIn: () => null,
  SignUp: () => null,
}));

const m = vi.hoisted(() => ({
  resumen: vi.fn(),
  ajustes: vi.fn(),
  clientes: vi.fn(),
  ficha: vi.fn(),
  crearCliente: vi.fn(),
}));

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, fiadoApi: { ...actual.fiadoApi, ...m } };
});

// ─── Datos ────────────────────────────────────────────────────────────────────

const cliente = (over: Partial<Cliente> = {}): Cliente => ({
  id: 1,
  nombre: 'Marta Giménez',
  telefono: '11 1234-5678',
  whatsapp: '5491112345678',
  etiqueta: null,
  limite: 40000,
  proximo_cobro: null,
  saldo: 42300,
  dias_sin_pagar: 35,
  excede_limite: true,
  ...over,
});

const mov = (over: Partial<Movimiento> = {}): Movimiento => ({
  id: 10,
  cliente_id: 1,
  cliente_nombre: 'Marta Giménez',
  tipo: 'fiado',
  monto: 4200,
  nota: null,
  created_at: '2026-10-13T17:00:00Z',
  corrige_id: null,
  corregido_por: null,
  ...over,
});

const ajustes = {
  comercio: 'Kiosco Lu',
  alias: null,
  dias_deuda_vieja: 30,
  plantilla_fiado: '',
  plantilla_pago: '',
  plantilla_recordatorio: '',
};

/** Muestra la ruta actual para afirmar navegaciones. */
function Donde() {
  const loc = useLocation();
  return <div data-testid="donde">{loc.pathname + loc.search}</div>;
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

beforeEach(() => {
  m.ajustes.mockResolvedValue(ajustes);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─── Textos ───────────────────────────────────────────────────────────────────

describe('textos', () => {
  it('días, saldo y línea secundaria sin jerga', () => {
    expect(textoDias(null)).toBeNull();
    expect(textoDias(0)).toBe('Anotado hoy');
    expect(textoDias(1)).toBe('1 día sin pagar');
    expect(textoDias(18)).toBe('18 días sin pagar');
    expect(textoSaldo(-500)).toBe('$ 500 a favor');
    expect(lineaCliente({ saldo: 0, dias_sin_pagar: null })).toBe('Al día');
  });
});

// ─── Inicio ───────────────────────────────────────────────────────────────────

describe('Inicio', () => {
  it('muestra comercio, total, para cobrar hoy y últimos movimientos', async () => {
    const resumen: Resumen = {
      total: 42300,
      clientes_con_deuda: 3,
      para_cobrar: [{ ...cliente(), recordado_hoy: false }],
      ultimos: [mov(), mov({ id: 11, tipo: 'pago', monto: -1000 })],
    };
    m.resumen.mockResolvedValue(resumen);
    m.ficha.mockResolvedValue({ cliente: cliente(), historial: [] });
    renderAt('/fiado');

    expect(await screen.findByText('$ 42.300', { selector: 'p' })).toBeDefined();
    expect(screen.getByText('Kiosco Lu')).toBeDefined();
    expect(screen.getByText('entre 3 clientes')).toBeDefined();

    const cobrar = screen.getByRole('list', { name: 'Para cobrar hoy' });
    expect(within(cobrar).getByRole('button', { name: 'Recordar' })).toBeDefined();
    // Más de 30 días: texto de atraso en negrita y color --late.
    expect(within(cobrar).getByText('35 días sin pagar').className).toContain('text-late');

    const ultimos = screen.getByRole('list', { name: 'Últimos movimientos' });
    expect(within(ultimos).getByText('+ $ 4.200').className).toContain('text-fiado');
    expect(within(ultimos).getByText('− $ 1.000').className).toContain('text-pago');

    fireEvent.click(within(cobrar).getByRole('button', { name: /Marta Giménez/ }));
    expect(donde()).toBe('/fiado/clientes/1');
  });

  it('estados vacíos escritos', async () => {
    m.resumen.mockResolvedValue({ total: 0, clientes_con_deuda: 0, para_cobrar: [], ultimos: [] });
    renderAt('/fiado');
    expect(await screen.findByText('Nadie para cobrar hoy.')).toBeDefined();
    expect(screen.getByText('Todavía no hay movimientos.')).toBeDefined();
  });

  it('error de red con reintento', async () => {
    m.resumen.mockRejectedValueOnce(new Error('500 {"error":"Internal server error"}'));
    renderAt('/fiado');
    expect(await screen.findByText('Internal server error')).toBeDefined();
    m.resumen.mockResolvedValue({ total: 0, clientes_con_deuda: 0, para_cobrar: [], ultimos: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Probar de nuevo' }));
    expect(await screen.findByText('Nadie para cobrar hoy.')).toBeDefined();
  });

  it('barra inferior: Inicio, Clientes, Ajustes y Más', async () => {
    m.resumen.mockResolvedValue({ total: 0, clientes_con_deuda: 0, para_cobrar: [], ultimos: [] });
    renderAt('/fiado');
    const nav = screen.getByRole('navigation', { name: 'Navegación inferior' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Inicio', 'Clientes', 'Ajustes', 'Más']);
    // Fiado no tiene la barra superior del host (marca "Neggo").
    expect(screen.queryByText('Neggo')).toBeNull();
    await screen.findByText('Nadie para cobrar hoy.');
  });
});

// ─── Clientes ─────────────────────────────────────────────────────────────────

describe('Clientes', () => {
  it('lista, busca (con espera) y cambia el orden', async () => {
    m.clientes.mockResolvedValue([
      cliente(),
      cliente({ id: 2, nombre: 'Ana', saldo: -500, excede_limite: false }),
    ]);
    renderAt('/fiado/clientes');

    expect(await screen.findByRole('button', { name: /Marta Giménez/ })).toBeDefined();
    expect(screen.getByText('a favor')).toBeDefined();
    expect(m.clientes).toHaveBeenLastCalledWith('', 'deuda');

    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'mar' } });
    await waitFor(() => expect(m.clientes).toHaveBeenLastCalledWith('mar', 'deuda'));

    fireEvent.click(screen.getByRole('button', { name: 'A a Z' }));
    await waitFor(() => expect(m.clientes).toHaveBeenLastCalledWith('mar', 'az'));
    expect(screen.getByRole('button', { name: 'A a Z' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('vacío distingue búsqueda sin resultados de lista vacía', async () => {
    m.clientes.mockResolvedValue([]);
    renderAt('/fiado/clientes');
    expect(await screen.findByText('Todavía no anotaste clientes.')).toBeDefined();
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'zz' } });
    expect(await screen.findByText('No hay clientes con ese nombre.')).toBeDefined();
  });

  it('"Nuevo" abre el alta como pantalla de tarea (sin barra inferior)', async () => {
    m.clientes.mockResolvedValue([]);
    renderAt('/fiado/clientes');
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo' }));
    expect(donde()).toBe('/fiado/clientes/nuevo');
    expect(screen.queryByRole('navigation', { name: 'Navegación inferior' })).toBeNull();
    await screen.findByText('Todavía no anotaste clientes.').catch(() => undefined);
  });
});

// ─── Ficha ────────────────────────────────────────────────────────────────────

describe('Ficha', () => {
  it('muestra saldo, celdas, aviso de límite e historial con correcciones visibles', async () => {
    const ficha: Ficha = {
      cliente: cliente({ proximo_cobro: '2026-11-01' }),
      historial: [
        mov({ id: 12, tipo: 'correccion', monto: -4200, corrige_id: 10 }),
        mov({ id: 10, corregido_por: 12 }),
      ],
    };
    m.ficha.mockResolvedValue(ficha);
    renderAt('/fiado/clientes/1');

    expect(await screen.findByRole('heading', { level: 2, name: 'Marta Giménez' })).toBeDefined();
    expect(screen.getByText('$ 42.300')).toBeDefined();
    expect(screen.getByText('$ 40.000')).toBeDefined();
    expect(screen.getByText('35 días')).toBeDefined();
    expect(screen.getByText(/Pasó el límite de \$ 40\.000/).tagName).toBe('OUTPUT');

    const historial = screen.getByRole('list', { name: 'Historial' });
    expect(within(historial).getByText('Corregido')).toBeDefined();
    expect(within(historial).getByText('+ $ 4.200').className).toContain('line-through');
    expect(within(historial).getByText(/Deshace un movimiento anterior/)).toBeDefined();
    expect(m.ficha).toHaveBeenCalledWith(1);
    // La ficha marca "Clientes" en la barra inferior.
    const nav = screen.getByRole('navigation', { name: 'Navegación inferior' });
    expect(within(nav).getByRole('link', { name: 'Clientes' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('volver sin historial va a la lista de clientes', async () => {
    m.ficha.mockResolvedValue({ cliente: cliente(), historial: [] });
    m.clientes.mockResolvedValue([]);
    renderAt('/fiado/clientes/1');
    expect(await screen.findByText('Todavía no hay movimientos.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(donde()).toBe('/fiado/clientes');
  });
});

// ─── Nuevo cliente ────────────────────────────────────────────────────────────

describe('Nuevo cliente', () => {
  it('guardar se habilita con nombre; crea y abre la ficha', async () => {
    m.crearCliente.mockResolvedValue(cliente({ id: 7, nombre: 'Rosa' }));
    m.ficha.mockResolvedValue({ cliente: cliente({ id: 7, nombre: 'Rosa' }), historial: [] });
    renderAt('/fiado/clientes/nuevo');

    const guardar = screen.getByRole('button', { name: 'Guardar cliente' }) as HTMLButtonElement;
    expect(guardar.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: ' Rosa ' } });
    fireEvent.change(screen.getByLabelText('Límite de fiado (opcional)'), {
      target: { value: '$ 50.000' },
    });
    expect(guardar.disabled).toBe(false);

    await act(async () => {
      fireEvent.click(guardar);
    });
    expect(m.crearCliente).toHaveBeenCalledWith({
      nombre: 'Rosa',
      telefono: null,
      limite: 50000,
      proximo_cobro: null,
    });
    await waitFor(() => expect(donde()).toBe('/fiado/clientes/7'));
    expect(screen.getByTestId('toast-region').textContent).toContain('Guardaste a Rosa.');
  });

  it('precarga ?nombre= y muestra el error del backend', async () => {
    m.crearCliente.mockRejectedValue(
      new Error('400 {"error":"nombre no puede superar 80 caracteres"}'),
    );
    renderAt('/fiado/clientes/nuevo?nombre=Pepe');
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Pepe');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cliente' }));
    });
    expect(await screen.findByText('nombre no puede superar 80 caracteres')).toBeDefined();
    expect(donde()).toBe('/fiado/clientes/nuevo?nombre=Pepe');
  });
});
