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
  avisos: vi.fn(),
  ajustes: vi.fn(),
  clientes: vi.fn(),
  ficha: vi.fn(),
  crearCliente: vi.fn(),
  actualizarCliente: vi.fn(),
  guardarAjustes: vi.fn(),
}));

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, fiadoApi: { ...actual.fiadoApi, ...m } };
});

const uso = vi.hoisted(() => ({ registrarUso: vi.fn() }));
vi.mock('../../host/uso', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../host/uso')>()),
  registrarUso: uso.registrarUso,
}));

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
  vencido: 0,
  vencido_desde: null,
  proximo_vencimiento: null,
  sin_recargo: false,
  recargos_pendientes: 0,
  recargo_para_sumar: 0,
  aviso_recargo_pendiente: false,
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
  vence: null,
  pendiente: null,
  recargo_de: null,
  recargo_dias: null,
  ...over,
});

const ajustes = {
  comercio: 'Kiosco Lu',
  alias: null,
  dias_deuda_vieja: 30,
  plantilla_fiado: '',
  plantilla_pago: '',
  plantilla_recordatorio: '',
  recargo: null,
  recargo_condiciones: null,
  recargo_version: 0,
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

const sinAvisos = { vencidos: [], hoy: [], proximos: [], sin_recordar: 0 };

beforeEach(() => {
  m.ajustes.mockResolvedValue(ajustes);
  m.avisos.mockResolvedValue(sinAvisos);
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
      clientes_con_deuda: 3, clientes: 3,
      para_cobrar: [
        { ...cliente({ vencido: 30000, vencido_desde: '2026-09-01' }), recordado_hoy: false },
      ],
      ultimos: [mov(), mov({ id: 11, tipo: 'pago', monto: -1000 })],
    };
    m.resumen.mockResolvedValue(resumen);
    m.ficha.mockResolvedValue({ cliente: cliente(), historial: [], recargo: null });
    renderAt('/fiado');

    expect(await screen.findByText('$ 42.300', { selector: 'p' })).toBeDefined();
    expect(screen.getByText('Kiosco Lu')).toBeDefined();
    expect(screen.getByText('entre 3 clientes')).toBeDefined();

    const cobrar = screen.getByRole('list', { name: 'Para cobrar hoy' });
    expect(within(cobrar).getByRole('button', { name: 'Recordar' })).toBeDefined();
    // Lo vencido y de cuánto es la deuda; más de 30 días: en negrita y color --late.
    expect(within(cobrar).getByText(/\$ 30\.000 vencido de \$ 42\.300/)).toBeDefined();
    expect(within(cobrar).getByText(/venció el 1 sept?/).className).toContain('text-late');

    const ultimos = screen.getByRole('list', { name: 'Últimos movimientos' });
    expect(within(ultimos).getByText('+ $ 4.200').className).toContain('text-fiado');
    expect(within(ultimos).getByText('− $ 1.000').className).toContain('text-pago');

    fireEvent.click(within(cobrar).getByRole('button', { name: /Marta Giménez/ }));
    expect(donde()).toBe('/fiado/clientes/1');
  });

  it('estados vacíos escritos', async () => {
    m.resumen.mockResolvedValue({
      total: 0,
      clientes_con_deuda: 0,
      clientes: 0,
      para_cobrar: [],
      ultimos: [],
    });
    renderAt('/fiado');
    expect(await screen.findByText('Nadie para cobrar hoy.')).toBeDefined();
    expect(screen.getByText('Todavía no hay movimientos.')).toBeDefined();
  });

  it('error de red con reintento', async () => {
    m.resumen.mockRejectedValueOnce(new Error('500 {"error":"Internal server error"}'));
    renderAt('/fiado');
    expect(await screen.findByText('Internal server error')).toBeDefined();
    m.resumen.mockResolvedValue({
      total: 0,
      clientes_con_deuda: 0,
      clientes: 0,
      para_cobrar: [],
      ultimos: [],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Probar de nuevo' }));
    expect(await screen.findByText('Nadie para cobrar hoy.')).toBeDefined();
  });

  it('barra inferior: Inicio, Clientes, Ajustes y Más', async () => {
    m.resumen.mockResolvedValue({
      total: 0,
      clientes_con_deuda: 0,
      clientes: 0,
      para_cobrar: [],
      ultimos: [],
    });
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

// ─── Campanita y avisos (nota de prueba #3) ──────────────────────────────────

describe('Avisos', () => {
  const aviso = (over: Partial<import('./api').Aviso> = {}) => ({
    cliente_id: 1,
    cliente_nombre: 'Marta Giménez',
    monto: 3000,
    fecha: '2020-01-10',
    recordado_hoy: false,
    ...over,
  });

  it('la campanita del inicio muestra cuántos hay para cobrar y abre los avisos', async () => {
    m.resumen.mockResolvedValue({
      total: 0,
      clientes_con_deuda: 0,
      clientes: 0,
      para_cobrar: [],
      ultimos: [],
    });
    m.avisos.mockResolvedValue({ ...sinAvisos, vencidos: [aviso()], sin_recordar: 2 });
    renderAt('/fiado');
    const campana = await screen.findByRole('button', { name: 'Avisos: 2 para cobrar' });
    expect(campana.textContent).toContain('2');
    fireEvent.click(campana);
    expect(donde()).toBe('/fiado/avisos');
  });

  it('sin nada para cobrar, la campanita no lleva número', async () => {
    m.resumen.mockResolvedValue({
      total: 0,
      clientes_con_deuda: 0,
      clientes: 0,
      para_cobrar: [],
      ultimos: [],
    });
    renderAt('/fiado');
    await screen.findByText('Nadie para cobrar hoy.');
    expect(screen.getByRole('button', { name: 'Avisos' }).textContent).toBe('');
  });

  it('agrupa vencidos y próximos; "Recordar" lleva al recordatorio', async () => {
    m.avisos.mockResolvedValue({
      vencidos: [aviso()],
      hoy: [],
      proximos: [aviso({ cliente_id: 2, cliente_nombre: 'Ana', fecha: '2999-01-01' })],
      sin_recordar: 1,
    });
    renderAt('/fiado/avisos');
    const vencidos = await screen.findByRole('list', { name: 'Vencidos' });
    expect(within(vencidos).getByText(/venció el 10 ene/)).toBeDefined();
    expect(screen.queryByRole('list', { name: 'Vencen hoy' })).toBeNull();
    const proximos = screen.getByRole('list', { name: 'Próximos 7 días' });
    expect(within(proximos).getByText('Ana')).toBeDefined();
    fireEvent.click(within(vencidos).getByRole('button', { name: 'Recordar' }));
    expect(donde()).toBe('/fiado/recordar/1');
  });

  it('sin avisos: estado vacío escrito', async () => {
    renderAt('/fiado/avisos');
    expect(
      await screen.findByText('No tenés cobros vencidos ni por vencer esta semana.'),
    ).toBeDefined();
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
      cliente: cliente({
        vencido: 1200,
        proximo_vencimiento: { fecha: '2026-11-01', monto: 3000 },
      }),
      historial: [
        mov({ id: 12, tipo: 'correccion', monto: -4200, corrige_id: 10 }),
        mov({ id: 10, corregido_por: 12 }),
      ],
      recargo: null,
    };
    m.ficha.mockResolvedValue(ficha);
    renderAt('/fiado/clientes/1');

    expect(await screen.findByRole('heading', { level: 2, name: 'Marta Giménez' })).toBeDefined();
    expect(screen.getByText('$ 42.300')).toBeDefined();
    expect(screen.getByText('$ 40.000')).toBeDefined();
    expect(screen.getByText('35 días')).toBeDefined();
    expect(screen.getByText('1 nov')).toBeDefined();
    expect(screen.getByText('Tiene $ 1.200 vencido.')).toBeDefined();
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
    m.ficha.mockResolvedValue({ cliente: cliente(), historial: [], recargo: null });
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
    m.ficha.mockResolvedValue({
      cliente: cliente({ id: 7, nombre: 'Rosa' }),
      historial: [],
      recargo: null,
    });
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
    });
    await waitFor(() => expect(donde()).toBe('/fiado/clientes/7'));
    expect(screen.getByTestId('toast-region').textContent).toContain('Guardaste a Rosa.');
  });

  it('"¿Ya te debe algo?" manda el saldo inicial con clave; sin recargos', async () => {
    m.crearCliente.mockResolvedValue(cliente({ id: 7, nombre: 'Rosa' }));
    m.ficha.mockResolvedValue({ cliente: cliente({ id: 7 }), historial: [], recargo: null });
    renderAt('/fiado/clientes/nuevo');

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Rosa' } });
    fireEvent.change(await screen.findByLabelText('¿Ya te debe algo? (opcional)'), {
      target: { value: '$ 8.500' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cliente' }));
    });
    expect(m.crearCliente).toHaveBeenCalledWith({
      nombre: 'Rosa',
      telefono: null,
      limite: null,
      saldo_inicial: 8500,
      idempotency_key: expect.any(String),
    });
  });

  it('con recargos activos no ofrece el saldo inicial', async () => {
    m.ajustes.mockResolvedValue({
      ...ajustes,
      recargo: { esquema: 'mes', tipo: 'pct', valor: 5, tolerancia: 7 },
    });
    renderAt('/fiado/clientes/nuevo');
    await waitFor(() => expect(m.ajustes).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByLabelText('¿Ya te debe algo? (opcional)')).toBeNull();
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

// ─── Bienvenida (plan de adopción, fase 1) ──────────────────────────────────

describe('Bienvenida', () => {
  const vacio: Resumen = {
    total: 0,
    clientes_con_deuda: 0,
    clientes: 0,
    para_cobrar: [],
    ultimos: [],
  };

  beforeEach(() => {
    window.sessionStorage.clear();
    m.ajustes.mockResolvedValue({ ...ajustes, comercio: '' });
    m.resumen.mockResolvedValue(vacio);
  });

  it('un comercio sin nombre ni clientes va del Inicio a la bienvenida', async () => {
    renderAt('/fiado');
    await waitFor(() => expect(donde()).toBe('/fiado/bienvenida'));
    expect(screen.getByRole('heading', { name: 'Arranquemos' })).toBeDefined();
  });

  it('con nombre de comercio o con clientes, el Inicio no redirige', async () => {
    m.resumen.mockResolvedValue({ ...vacio, clientes: 2 });
    renderAt('/fiado');
    expect(await screen.findByText('Nadie para cobrar hoy.')).toBeDefined();
    expect(donde()).toBe('/fiado');
  });

  it('guarda comercio, cliente y saldo, y cae en el Inicio', async () => {
    m.guardarAjustes.mockResolvedValue({ ...ajustes, comercio: 'Kiosco Lu' });
    m.crearCliente.mockResolvedValue(cliente({ id: 7, nombre: 'Rosa', saldo: 8500 }));
    renderAt('/fiado/bienvenida');

    const listo = screen.getByRole('button', { name: 'Listo, empezar' }) as HTMLButtonElement;
    expect(listo.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('¿Cómo se llama tu comercio?'), {
      target: { value: ' Kiosco Lu ' },
    });
    fireEvent.change(screen.getByLabelText('¿Quién te debe más?'), {
      target: { value: 'Rosa' },
    });
    fireEvent.change(screen.getByLabelText('Su teléfono (opcional)'), {
      target: { value: '11 5555-0000' },
    });
    fireEvent.change(await screen.findByLabelText('¿Cuánto te debe hoy?'), {
      target: { value: '8.500' },
    });
    expect(listo.disabled).toBe(false);

    m.ajustes.mockResolvedValue({ ...ajustes, comercio: 'Kiosco Lu' });
    m.resumen.mockResolvedValue({ ...vacio, total: 8500, clientes_con_deuda: 1, clientes: 1 });
    await act(async () => {
      fireEvent.click(listo);
    });
    expect(m.guardarAjustes).toHaveBeenCalledWith({ comercio: 'Kiosco Lu' });
    expect(m.crearCliente).toHaveBeenCalledWith({
      nombre: 'Rosa',
      telefono: '11 5555-0000',
      saldo_inicial: 8500,
      idempotency_key: expect.any(String),
    });
    await waitFor(() => expect(donde()).toBe('/fiado'));
    expect(await screen.findByText('$ 8.500', { selector: 'p' })).toBeDefined();
    expect(screen.getByTestId('toast-region').textContent).toContain('Listo, ya anotaste a Rosa.');
    expect(uso.registrarUso).toHaveBeenCalledWith('bienvenida_hecha', 'fiado');
  });

  it('sin monto crea el cliente sin saldo; un error se muestra y deja reintentar', async () => {
    m.guardarAjustes.mockResolvedValue({ ...ajustes, comercio: 'Kiosco Lu' });
    m.crearCliente.mockRejectedValueOnce(new Error('500 {"error":"Se cortó la conexión"}'));
    renderAt('/fiado/bienvenida');
    fireEvent.change(screen.getByLabelText('¿Cómo se llama tu comercio?'), {
      target: { value: 'Kiosco Lu' },
    });
    fireEvent.change(screen.getByLabelText('¿Quién te debe más?'), {
      target: { value: 'Rosa' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Listo, empezar' }));
    });
    expect(await screen.findByText('Se cortó la conexión')).toBeDefined();
    expect(m.crearCliente).toHaveBeenCalledWith({ nombre: 'Rosa', telefono: null });
    expect(donde()).toBe('/fiado/bienvenida');
    expect(uso.registrarUso).not.toHaveBeenCalledWith('bienvenida_hecha', 'fiado');
  });

  it('"Lo hago después" vuelve al Inicio y no insiste', async () => {
    renderAt('/fiado/bienvenida');
    fireEvent.click(screen.getByRole('button', { name: 'Lo hago después' }));
    expect(await screen.findByText('Nadie para cobrar hoy.')).toBeDefined();
    expect(donde()).toBe('/fiado');
    expect(uso.registrarUso).not.toHaveBeenCalledWith('bienvenida_hecha', 'fiado');
  });
});

// ─── Editar cliente ───────────────────────────────────────────────────────────

describe('Editar cliente', () => {
  it('desde la ficha abre el formulario con los datos cargados', async () => {
    m.ficha.mockResolvedValue({ cliente: cliente(), historial: [], recargo: null });
    renderAt('/fiado/clientes/1');
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    expect(donde()).toBe('/fiado/clientes/1/editar');
    expect(((await screen.findByLabelText('Nombre')) as HTMLInputElement).value).toBe(
      'Marta Giménez',
    );
    expect((screen.getByLabelText('Teléfono (opcional)') as HTMLInputElement).value).toBe(
      '11 1234-5678',
    );
    expect((screen.getByLabelText('Límite de fiado (opcional)') as HTMLInputElement).value).toBe(
      '40000',
    );
  });

  it('guarda los cambios (vaciar el límite lo saca) y vuelve a la ficha', async () => {
    m.ficha.mockResolvedValue({ cliente: cliente(), historial: [], recargo: null });
    m.actualizarCliente.mockResolvedValue(cliente({ nombre: 'Marta Gómez', limite: null }));
    renderAt('/fiado/clientes/1/editar');

    fireEvent.change(await screen.findByLabelText('Nombre'), {
      target: { value: ' Marta Gómez ' },
    });
    fireEvent.change(screen.getByLabelText('Límite de fiado (opcional)'), {
      target: { value: '' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    });
    expect(m.actualizarCliente).toHaveBeenCalledWith(1, {
      nombre: 'Marta Gómez',
      telefono: '11 1234-5678',
      limite: null,
    });
    await waitFor(() => expect(donde()).toBe('/fiado/clientes/1'));
    expect(screen.getByTestId('toast-region').textContent).toContain(
      'Guardaste los datos de Marta Gómez.',
    );
  });

  it('sin nombre no deja guardar; muestra el error del backend', async () => {
    m.ficha.mockResolvedValue({ cliente: cliente(), historial: [], recargo: null });
    m.actualizarCliente.mockRejectedValue(new Error('400 {"error":"limite inválido"}'));
    renderAt('/fiado/clientes/1/editar');

    const nombre = await screen.findByLabelText('Nombre');
    const guardar = screen.getByRole('button', { name: 'Guardar cambios' }) as HTMLButtonElement;
    fireEvent.change(nombre, { target: { value: '  ' } });
    expect(guardar.disabled).toBe(true);
    fireEvent.change(nombre, { target: { value: 'Marta' } });
    await act(async () => {
      fireEvent.click(guardar);
    });
    expect(await screen.findByText('limite inválido')).toBeDefined();
    expect(donde()).toBe('/fiado/clientes/1/editar');
  });
});
