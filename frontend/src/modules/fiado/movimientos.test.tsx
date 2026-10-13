import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HostApp } from '../../host/HostApp';
import { KEY_BORRAR, applyKey } from '../../host/ui/Keypad';
import type { Cliente, MovimientoResult } from './api';
import { fiado } from './index';
import { conCliente, esRutaDelModulo } from './rutas';

vi.mock('@clerk/clerk-react', () => ({
  SignedIn: ({ children }: { children: ReactNode }) => children,
  SignedOut: () => null,
  RedirectToSignIn: () => null,
  UserButton: () => null,
  SignInButton: ({ children }: { children: ReactNode }) => children,
  SignIn: () => null,
  SignUp: () => null,
}));

const m = vi.hoisted(() => ({
  ficha: vi.fn(),
  clientes: vi.fn(),
  crearMovimiento: vi.fn(),
  corregir: vi.fn(),
}));

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, fiadoApi: { ...actual.fiadoApi, ...m } };
});

const cliente = (over: Partial<Cliente> = {}): Cliente => ({
  id: 1,
  nombre: 'Marta Giménez',
  telefono: null,
  whatsapp: null,
  etiqueta: null,
  limite: 5000,
  proximo_cobro: null,
  saldo: 3000,
  dias_sin_pagar: 3,
  excede_limite: false,
  ...over,
});

const resultado = (
  over: Partial<MovimientoResult['movimiento']>,
  c: Cliente,
): MovimientoResult => ({
  movimiento: {
    id: 50,
    cliente_id: c.id,
    cliente_nombre: c.nombre,
    tipo: 'fiado',
    monto: 4200,
    nota: null,
    created_at: '2026-10-13T17:00:00Z',
    corrige_id: null,
    corregido_por: null,
    ...over,
  },
  cliente: c,
});

function Donde() {
  const loc = useLocation();
  return <div data-testid="donde">{loc.pathname + loc.search}</div>;
}

function renderAt(entries: string[]) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <HostApp modules={[fiado]} />
      <Donde />
    </MemoryRouter>,
  );
}

const donde = () => screen.getByTestId('donde').textContent;
const tocar = (...teclas: string[]) => {
  for (const t of teclas) fireEvent.click(screen.getByRole('button', { name: t }));
};

beforeEach(() => {
  m.ficha.mockResolvedValue({ cliente: cliente(), historial: [] });
  m.clientes.mockResolvedValue([cliente()]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('teclado', () => {
  it('sin ceros a la izquierda, máximo 9 dígitos y borrar', () => {
    expect(applyKey('', '0')).toBe('');
    expect(applyKey('', '00')).toBe('');
    expect(applyKey('42', '00')).toBe('4200');
    expect(applyKey('123456789', '1')).toBe('123456789');
    expect(applyKey('12345678', '00')).toBe('12345678');
    expect(applyKey('4200', KEY_BORRAR)).toBe('420');
  });
});

describe('rutas', () => {
  it('conCliente agrega el id y esRutaDelModulo rechaza rutas externas', () => {
    expect(conCliente('/fiado/anotar', 7)).toBe('/fiado/anotar?cliente=7');
    expect(esRutaDelModulo('/fiado/pago')).toBe(true);
    expect(esRutaDelModulo('https://malo.com')).toBe(false);
    expect(esRutaDelModulo('//malo.com/fiado/')).toBe(false);
    expect(esRutaDelModulo(null)).toBe(false);
  });
});

describe('Anotar fiado', () => {
  it('desde la ficha: cliente elegido, monto con teclado, confirma y pasa por Listo', async () => {
    const c = cliente({ saldo: 7200, excede_limite: true });
    m.crearMovimiento.mockResolvedValue(resultado({}, c));
    renderAt(['/fiado/clientes/1']);

    fireEvent.click(await screen.findByRole('button', { name: 'Fiado' }));
    expect(donde()).toBe('/fiado/anotar?cliente=1');
    expect(screen.queryByRole('navigation', { name: 'Navegación inferior' })).toBeNull();
    expect(await screen.findByText('Saldo actual $ 3.000')).toBeDefined();

    const confirmar = screen.getByRole('button', { name: 'Anotar fiado' }) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);
    tocar('4', '2', '00');
    expect(screen.getByText('$ 4.200').className).toContain('text-fiado');
    expect(confirmar.disabled).toBe(false);

    await act(async () => {
      fireEvent.click(confirmar);
    });
    expect(m.crearMovimiento).toHaveBeenCalledWith(
      expect.objectContaining({ cliente_id: 1, tipo: 'fiado', monto: 4200, nota: null }),
    );
    expect(m.crearMovimiento.mock.calls[0]?.[0].idempotency_key).toBeTruthy();

    await waitFor(() => expect(donde()).toBe('/fiado/listo'));
    expect(screen.getByRole('heading', { name: 'Listo' })).toBeDefined();
    expect(screen.getByText('Anotaste $ 4.200 de fiado a Marta.')).toBeDefined();
    expect(screen.getByText('$ 7.200')).toBeDefined();
    expect(screen.getByText(/Marta pasó el límite de \$ 5\.000/)).toBeDefined();
  });

  it('sin cliente no se puede confirmar; "Crear cliente nuevo" lleva lo tipeado', async () => {
    m.clientes.mockResolvedValue([]);
    renderAt(['/fiado', '/fiado/anotar']);
    tocar('5');
    expect(
      (screen.getByRole('button', { name: 'Anotar fiado' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText('¿A quién?'), { target: { value: 'Rosa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear cliente nuevo' }));
    expect(donde()).toBe('/fiado/clientes/nuevo?nombre=Rosa&siguiente=%2Ffiado%2Fanotar');
  });

  it('elegir un cliente de la búsqueda y "Cambiar"', async () => {
    renderAt(['/fiado', '/fiado/anotar']);
    fireEvent.click(await screen.findByRole('button', { name: /Marta Giménez/ }));
    expect(screen.getByText('Saldo actual $ 3.000')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar' }));
    expect(screen.getByLabelText('¿A quién?')).toBeDefined();
  });

  it('muestra el error del backend y deja reintentar', async () => {
    m.crearMovimiento.mockRejectedValue(new Error('400 {"error":"monto debe ser un entero"}'));
    renderAt(['/fiado/anotar?cliente=1']);
    await screen.findByText('Saldo actual $ 3.000');
    tocar('1');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Anotar fiado' }));
    });
    expect(await screen.findByText('monto debe ser un entero')).toBeDefined();
    expect(donde()).toBe('/fiado/anotar?cliente=1');
  });
});

describe('Registrar pago', () => {
  it('"Pagó todo" carga el saldo completo en azul', async () => {
    renderAt(['/fiado/pago?cliente=1']);
    expect(await screen.findByRole('heading', { name: 'Registrar pago' })).toBeDefined();
    fireEvent.click(await screen.findByRole('button', { name: 'Pagó todo ($ 3.000)' }));
    const monto = screen.getAllByText('$ 3.000').find((el) => el.className.includes('text-pago'));
    expect(monto).toBeDefined();
  });
});

describe('Listo y Deshacer', () => {
  const estado = (c: Cliente) => ({ tipo: 'fiado' as const, resultado: resultado({}, c) });

  function renderListo() {
    return render(
      <MemoryRouter
        initialEntries={[
          '/fiado/clientes/1',
          { pathname: '/fiado/listo', state: estado(cliente()) },
        ]}
        initialIndex={1}
      >
        <HostApp modules={[fiado]} />
        <Donde />
      </MemoryRouter>,
    );
  }

  it('Deshacer crea la corrección y vuelve al origen', async () => {
    m.corregir.mockResolvedValue(
      resultado({ id: 51, tipo: 'correccion', monto: -4200, corrige_id: 50 }, cliente()),
    );
    renderListo();
    const region = screen.getByTestId('toast-region');
    expect(region.textContent).toContain('Anotaste $ 4.200.');

    await act(async () => {
      fireEvent.click(within(region).getByRole('button', { name: 'Deshacer' }));
    });
    expect(m.corregir).toHaveBeenCalledWith(50);
    await waitFor(() => expect(donde()).toBe('/fiado/clientes/1'));
    expect(region.textContent).toContain('Queda anotado en el historial como corrección');
  });

  it('"Ahora no" vuelve al origen y cierra el toast de Deshacer', async () => {
    renderListo();
    fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }));
    expect(donde()).toBe('/fiado/clientes/1');
    expect(screen.getByTestId('toast-region').textContent).toBe('');
    await screen.findByText('Todavía no hay movimientos.');
  });

  it('entrada directa sin datos → inicio', () => {
    m.ficha.mockResolvedValue({ cliente: cliente(), historial: [] });
    renderAt(['/fiado/listo']);
    expect(donde()).toBe('/fiado');
  });
});
