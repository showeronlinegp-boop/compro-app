import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HostApp } from '../../host/HostApp';
import type { Ajustes, Cliente, Resumen } from './api';
import { fiado } from './index';
import {
  comprobante,
  insertarVariable,
  linkWhatsApp,
  recordatorio,
  renderPlantilla,
} from './mensajes';

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
  ficha: vi.fn(),
  recordar: vi.fn(),
  guardarAjustes: vi.fn(),
}));

const uso = vi.hoisted(() => ({ registrarUso: vi.fn() }));
vi.mock('../../host/uso', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../host/uso')>()),
  registrarUso: uso.registrarUso,
}));

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, fiadoApi: { ...actual.fiadoApi, ...m } };
});

const ajustes: Ajustes = {
  comercio: 'Kiosco Lu',
  alias: 'kiosco.lu',
  dias_deuda_vieja: 30,
  plantilla_fiado:
    'Hola {nombre}, anoté {monto} en tu cuenta de {comercio}. Tu saldo es {saldo}.\n\nHecho con Neggo',
  plantilla_pago:
    'Hola {nombre}, registré tu pago de {monto}. Tu saldo es {saldo}. ¡Gracias!\n\nHecho con Neggo',
  plantilla_recordatorio:
    'Hola {nombre}, te recuerdo que tenés un saldo de {saldo} en {comercio}. Podés pagar por transferencia al alias {alias}. ¡Gracias!\n\nHecho con Neggo',
  recargo: null,
  recargo_condiciones: null,
  recargo_version: 0,
};

const cliente = (over: Partial<Cliente> = {}): Cliente => ({
  id: 1,
  nombre: 'Marta Giménez',
  telefono: '11 1234-5678',
  whatsapp: '5491112345678',
  etiqueta: null,
  limite: null,
  proximo_cobro: null,
  saldo: 42300,
  dias_sin_pagar: 18,
  excede_limite: false,
  vencido: 0,
  vencido_desde: null,
  proximo_vencimiento: null,
  sin_recargo: false,
  recargos_pendientes: 0,
  recargo_para_sumar: 0,
  aviso_recargo_pendiente: false,
  ...over,
});

function Donde() {
  const loc = useLocation();
  return <div data-testid="donde">{loc.pathname}</div>;
}

function renderAt(entries: (string | { pathname: string; state: unknown })[]) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <HostApp modules={[fiado]} />
      <Donde />
    </MemoryRouter>,
  );
}

const donde = () => screen.getByTestId('donde').textContent;
let open: { mock: { calls: unknown[][] }; mockRestore: () => void };

beforeEach(() => {
  m.ajustes.mockResolvedValue(ajustes);
  m.avisos.mockResolvedValue({ vencidos: [], hoy: [], proximos: [], sin_recordar: 0 });
  m.ficha.mockResolvedValue({ cliente: cliente(), historial: [], recargo: null });
  open = vi.spyOn(window, 'open').mockImplementation(() => null);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  open.mockRestore();
});

describe('mensajes', () => {
  it('comprobante con primer nombre, monto y saldo', () => {
    expect(comprobante('fiado', 4200, cliente(), ajustes)).toBe(
      'Hola Marta, anoté $ 4.200 en tu cuenta de Kiosco Lu. Tu saldo es $ 42.300.\n\nHecho con Neggo',
    );
    expect(comprobante('pago', 500, cliente({ saldo: -500 }), ajustes)).toContain(
      'Tu saldo es $ 500 a favor.',
    );
  });

  it('comprobante de fiado con fecha de cobro, o "a convenir" sin fecha', () => {
    const conFecha = { ...ajustes, plantilla_fiado: 'Fecha de cobro: {vence}' };
    expect(comprobante('fiado', 4200, cliente(), conFecha, '2026-11-10')).toBe(
      'Fecha de cobro: 10 nov\n\nHecho con Neggo',
    );
    expect(comprobante('fiado', 4200, cliente(), conFecha)).toBe(
      'Fecha de cobro: a convenir\n\nHecho con Neggo',
    );
  });

  it('recordatorio con alias; la firma se agrega si la borraron', () => {
    expect(recordatorio(cliente(), ajustes)).toContain('al alias kiosco.lu');
    expect(renderPlantilla('Hola {nombre}', { nombre: 'Ana' })).toBe('Hola Ana\n\nHecho con Neggo');
  });

  it('link de wa.me con y sin número', () => {
    expect(linkWhatsApp('5491112345678', 'Hola Ana')).toBe(
      'https://wa.me/5491112345678?text=Hola%20Ana',
    );
    expect(linkWhatsApp(null, 'Hola')).toBe('https://wa.me/?text=Hola');
  });
});

describe('Listo: comprobante por WhatsApp', () => {
  it('muestra la burbuja y "Enviar por WhatsApp" abre wa.me con el comprobante', async () => {
    const estado = {
      tipo: 'fiado',
      resultado: {
        movimiento: {
          id: 50,
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
          recargo_periodo: null,
        },
        cliente: cliente(),
      },
    };
    renderAt(['/fiado/clientes/1', { pathname: '/fiado/listo', state: estado }]);

    expect(await screen.findByText(/anoté \$ 4\.200 en tu cuenta de Kiosco Lu/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar por WhatsApp' }));
    const url = String(open.mock.calls[0]?.[0]);
    expect(url.startsWith('https://wa.me/5491112345678?text=')).toBe(true);
    expect(decodeURIComponent(url)).toContain('Hecho con Neggo');
    expect(uso.registrarUso).toHaveBeenCalledWith('comprobante', 'fiado');
    expect(donde()).toBe('/fiado/clientes/1');
  });
});

describe('Recordar pago', () => {
  it('abre WhatsApp con el recordatorio, marca recordado y vuelve', async () => {
    m.recordar.mockResolvedValue({ cliente_id: 1, enviado_at: '2026-10-13T17:00:00Z' });
    m.resumen.mockResolvedValue({ total: 0, clientes_con_deuda: 0, para_cobrar: [], ultimos: [] });
    renderAt(['/fiado', '/fiado/recordar/1']);

    expect(await screen.findByText(/te recuerdo que tenés un saldo de \$ 42\.300/)).toBeDefined();
    expect(screen.queryByRole('navigation', { name: 'Navegación inferior' })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Abrir WhatsApp' }));
    });
    expect(String(open.mock.calls[0]?.[0])).toContain('https://wa.me/5491112345678?text=');
    expect(m.recordar).toHaveBeenCalledWith(1);
    await waitFor(() => expect(donde()).toBe('/fiado'));
    expect(screen.getByTestId('toast-region').textContent).toContain('le recordaste a Marta');
  });

  it('sin celular válido avisa que se elige el contacto', async () => {
    m.ficha.mockResolvedValue({
      cliente: cliente({ whatsapp: null }),
      historial: [],
      recargo: null,
    });
    renderAt(['/fiado/recordar/1']);
    expect(await screen.findByText(/vas a elegir el contacto/)).toBeDefined();
  });
});

describe('Para cobrar hoy', () => {
  it('"Recordar" abre la pantalla y "Recordado" se muestra en verde', async () => {
    const resumen: Resumen = {
      total: 50000,
      clientes_con_deuda: 2,
      para_cobrar: [
        { ...cliente(), recordado_hoy: false },
        { ...cliente({ id: 2, nombre: 'Beto' }), recordado_hoy: true },
      ],
      ultimos: [],
    };
    m.resumen.mockResolvedValue(resumen);
    renderAt(['/fiado']);
    const lista = await screen.findByRole('list', { name: 'Para cobrar hoy' });
    expect(within(lista).getByText('Recordado').className).toContain('text-ok');
    expect(within(lista).getAllByRole('button', { name: 'Recordar' })).toHaveLength(1);
    fireEvent.click(within(lista).getByRole('button', { name: 'Recordar' }));
    expect(donde()).toBe('/fiado/recordar/1');
  });
});

describe('Ficha', () => {
  it('"Recordar" sólo aparece si debe algo', async () => {
    renderAt(['/fiado/clientes/1']);
    expect(await screen.findByRole('button', { name: 'Recordar' })).toBeDefined();
    cleanup();
    m.ficha.mockResolvedValue({
      cliente: cliente({ saldo: 0, dias_sin_pagar: null }),
      historial: [],
    });
    renderAt(['/fiado/clientes/1']);
    await screen.findByText('Todavía no hay movimientos.');
    expect(screen.queryByRole('button', { name: 'Recordar' })).toBeNull();
  });
});

describe('insertarVariable', () => {
  it('pone la variable en el cursor, separada de las palabras pegadas', () => {
    expect(insertarVariable('Hola', 'nombre', 4, 4)).toEqual({
      texto: 'Hola {nombre}',
      cursor: 13,
    });
    expect(insertarVariable('Hola !', 'nombre', 5, 5)).toEqual({
      texto: 'Hola {nombre}!',
      cursor: 13,
    });
    expect(insertarVariable('', 'saldo', 0, 0)).toEqual({ texto: '{saldo}', cursor: 7 });
    expect(insertarVariable('Debés X.', 'saldo', 6, 7).texto).toBe('Debés {saldo}.');
    expect(insertarVariable('Holachau', 'nombre', 4, 4).texto).toBe('Hola {nombre} chau');
  });
});

describe('Ajustes', () => {
  it('las pastillas suman el dato al mensaje sin escribir llaves', async () => {
    renderAt(['/fiado/ajustes']);
    const fiadoTxt = (await screen.findByLabelText('Comprobante de fiado')) as HTMLTextAreaElement;
    fireEvent.change(fiadoTxt, { target: { value: 'Hola' } });
    fiadoTxt.setSelectionRange(4, 4);

    const grupo = screen.getByRole('group', { name: 'Datos para Comprobante de fiado' });
    expect(within(grupo).queryByRole('button', { name: '+ Alias' })).toBeNull();
    fireEvent.click(within(grupo).getByRole('button', { name: '+ Nombre' }));
    expect(fiadoTxt.value).toBe('Hola {nombre}');

    const recordatorioGrupo = screen.getByRole('group', { name: 'Datos para Recordatorio' });
    expect(within(recordatorioGrupo).getByRole('button', { name: '+ Alias' })).toBeTruthy();
  });

  it('carga, edita y guarda; "Volver al mensaje original" vacía la plantilla', async () => {
    m.guardarAjustes.mockImplementation(async (p: Partial<Ajustes>) => ({ ...ajustes, ...p }));
    renderAt(['/fiado/ajustes']);

    const comercio = (await screen.findByLabelText('Nombre del comercio')) as HTMLInputElement;
    expect(comercio.value).toBe('Kiosco Lu');
    fireEvent.change(comercio, { target: { value: 'Almacén Rosa' } });
    fireEvent.change(screen.getByLabelText('Aviso de deuda vieja (días)'), {
      target: { value: '45 días' },
    });
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Volver al mensaje original' })[1] as HTMLElement,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    });
    expect(m.guardarAjustes).toHaveBeenCalledWith(
      expect.objectContaining({
        comercio: 'Almacén Rosa',
        alias: 'kiosco.lu',
        dias_deuda_vieja: 45,
        plantilla_pago: '',
      }),
    );
    expect(screen.getByTestId('toast-region').textContent).toContain('Guardaste los cambios.');
    const nav = screen.getByRole('navigation', { name: 'Navegación inferior' });
    expect(within(nav).getByRole('link', { name: 'Ajustes' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });
});
