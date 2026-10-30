import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HostApp } from '../../host/HostApp';
import { borradorDe, configDe, equivalenteMensual } from './AjustesRecargo';
import type { Ajustes, Cliente, Ficha, Movimiento, RecargoSugerido } from './api';
import { fiado } from './index';
import { comprobante, comprobanteRecargos, recordatorio } from './mensajes';
import { sinCortes } from './recargos';

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
  corregir: vi.fn(),
  perdonarRecargo: vi.fn(),
  guardarAjustes: vi.fn(),
  sumarRecargos: vi.fn(),
  omitirRecargo: vi.fn(),
  avisarRecargo: vi.fn(),
  actualizarCliente: vi.fn(),
}));

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, fiadoApi: { ...actual.fiadoApi, ...m } };
});

const CONDICIONES = 'un recargo del 5 % por cada mes de atraso, después de 7 días de gracia';

const ajustes = (over: Partial<Ajustes> = {}): Ajustes => ({
  comercio: 'Almacén Don Pepe',
  alias: 'don.pepe',
  dias_deuda_vieja: 30,
  plantilla_fiado:
    'Hola {nombre}, anoté {monto} en tu cuenta de {comercio}. Tu saldo es {saldo}.\n\nHecho con Neggo',
  plantilla_pago: 'Hola {nombre}, registré tu pago de {monto}.\n\nHecho con Neggo',
  plantilla_recordatorio: 'Hola {nombre}, tenés un saldo de {saldo}.\n\nHecho con Neggo',
  recargo: {
    esquema: 'mes',
    tipo: 'pct',
    valor: 5,
    tolerancia: 7,
    desde: 'vencimiento',
    activado_el: '2026-10-01',
  },
  recargo_condiciones: CONDICIONES,
  recargo_version: 1,
  recargo_terminos_version: '2026-10-30',
  recargo_terminos_aceptados: true,
  ...over,
});

const cliente = (over: Partial<Cliente> = {}): Cliente => ({
  id: 1,
  nombre: 'Marta Giménez',
  telefono: '11 1234-5678',
  whatsapp: '5491112345678',
  etiqueta: null,
  limite: null,
  proximo_cobro: null,
  saldo: 28000,
  dias_sin_pagar: 40,
  excede_limite: false,
  vencido: 28000,
  vencido_desde: '2026-10-15',
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
  monto: 12000,
  nota: null,
  created_at: '2026-09-15T15:00:00Z',
  corrige_id: null,
  corregido_por: null,
  vence: '2026-10-15',
  pendiente: 12000,
  recargo_de: null,
  recargo_dias: null,
  ...over,
});

const sugerido = (over: Partial<RecargoSugerido> = {}): RecargoSugerido => ({
  fiado_id: 10,
  fiado_fecha: '2026-09-15',
  vence: '2026-10-15',
  base: 12000,
  dias_atraso: 14,
  periodo_desde: 1,
  periodo_hasta: 1,
  monto: 600,
  detalle: '5 % de $ 12.000 · mes 1',
  ...over,
});

const ficha = (over: Partial<Ficha> = {}): Ficha => ({
  cliente: cliente(),
  historial: [mov()],
  recargo: null,
  ...over,
});

function Donde() {
  return <div data-testid="donde">{useLocation().pathname}</div>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={['/fiado', path]} initialIndex={1}>
      <HostApp modules={[fiado]} />
      <Donde />
    </MemoryRouter>,
  );
}

let open: { mock: { calls: unknown[][] }; mockRestore: () => void };

beforeEach(() => {
  m.ajustes.mockResolvedValue(ajustes());
  m.avisos.mockResolvedValue({ vencidos: [], hoy: [], proximos: [], sin_recordar: 0 });
  m.resumen.mockResolvedValue({ total: 0, clientes_con_deuda: 0, para_cobrar: [], ultimos: [] });
  m.ficha.mockResolvedValue(ficha());
  open = vi.spyOn(window, 'open').mockImplementation(() => null);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  open.mockRestore();
});

describe('mensajes con recargos', () => {
  it('en pantalla, "5 %" y "$ 12.000" no se parten entre líneas', () => {
    expect(sinCortes('5 % de $ 12.000')).toBe('5\u00a0% de $\u00a012.000');
  });

  it('el comprobante de fiado suma la línea fija de condiciones antes de la firma', () => {
    expect(comprobante('fiado', 4200, cliente(), ajustes())).toBe(
      `Hola Marta, anoté $ 4.200 en tu cuenta de Almacén Don Pepe. Tu saldo es $ 28.000.\n\nSi se atrasa, se cobra ${CONDICIONES}.\n\nHecho con Neggo`,
    );
  });

  it('sin recargos, con cliente "sin recargo" o en un pago, el comprobante no cambia', () => {
    const apagado = ajustes({ recargo: null, recargo_condiciones: null });
    expect(comprobante('fiado', 4200, cliente(), apagado)).not.toContain('Si se atrasa');
    expect(comprobante('fiado', 4200, cliente({ sin_recargo: true }), ajustes())).not.toContain(
      'Si se atrasa',
    );
    expect(comprobante('pago', 500, cliente(), ajustes())).not.toContain('Si se atrasa');
  });

  it('el recordatorio aclara cuánto del saldo son recargos', () => {
    expect(recordatorio(cliente({ saldo: 29400, recargos_pendientes: 1400 }), ajustes())).toBe(
      'Hola Marta, tenés un saldo de $ 29.400.\n\nDel saldo, $ 1.400 son recargos por atraso.\n\nHecho con Neggo',
    );
    expect(recordatorio(cliente(), ajustes())).not.toContain('recargos');
  });

  it('comprobante fijo de recargos: cada uno con su fiado y la cuenta', () => {
    expect(
      comprobanteRecargos(
        [
          { monto: 600, detalle: '5 % de $ 12.000 · mes 1', fiado_fecha: '2026-09-15' },
          { monto: 800, detalle: '5 % de $ 16.000 · mes 1', fiado_fecha: '2026-10-02' },
        ],
        cliente({ saldo: 43700 }),
        ajustes(),
      ),
    ).toBe(
      'Hola Marta, sumé recargos por atraso en tu cuenta de Almacén Don Pepe:\n• $ 600 por el fiado del 15 sept (5 % de $ 12.000 · mes 1)\n• $ 800 por el fiado del 2 oct (5 % de $ 16.000 · mes 1)\nTu saldo es $ 43.700.\n\nHecho con Neggo',
    );
  });
});

describe('ficha: aviso de condiciones', () => {
  const conAviso = () =>
    ficha({
      cliente: cliente({ aviso_recargo_pendiente: true }),
      recargo: {
        aviso: { texto: `Hola Marta, te aviso que… ${CONDICIONES}.` },
        sugeridos: [],
        total: 0,
      },
    });

  it('muestra el aviso y deshabilita "+ Fiado" (los pagos siguen)', async () => {
    m.ficha.mockResolvedValue(conAviso());
    renderAt('/fiado/clientes/1');
    const aviso = await screen.findByRole('region', { name: 'Aviso de condiciones de recargo' });
    expect(within(aviso).getByText(/Avisale a Marta las condiciones/)).toBeDefined();
    expect(within(aviso).getByText(/te aviso que/)).toBeDefined();
    expect((screen.getByRole('button', { name: /Fiado/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: /Pago/ }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('"Enviar por WhatsApp" abre WhatsApp con el texto y registra el aviso', async () => {
    m.ficha.mockResolvedValueOnce(conAviso()).mockResolvedValue(ficha());
    m.avisarRecargo.mockResolvedValue({ cliente_id: 1, version: 1, via: 'whatsapp' });
    renderAt('/fiado/clientes/1');
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar por WhatsApp' }));
    expect(String(open.mock.calls[0]?.[0])).toContain('wa.me/5491112345678');
    await waitFor(() => expect(m.avisarRecargo).toHaveBeenCalledWith(1, 'whatsapp'));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Aviso de condiciones de recargo' })).toBeNull(),
    );
  });

  it('"Cambio informado" registra el aviso sin abrir WhatsApp', async () => {
    m.ficha.mockResolvedValueOnce(conAviso()).mockResolvedValue(ficha());
    m.avisarRecargo.mockResolvedValue({ cliente_id: 1, version: 1, via: 'informado' });
    renderAt('/fiado/clientes/1');
    fireEvent.click(await screen.findByRole('button', { name: 'Cambio informado' }));
    await waitFor(() => expect(m.avisarRecargo).toHaveBeenCalledWith(1, 'informado'));
    expect(open).not.toHaveBeenCalled();
  });
});

describe('ficha: sugerencia', () => {
  const conSugerencia = () =>
    ficha({
      cliente: cliente({ recargo_para_sumar: 1400 }),
      historial: [
        mov(),
        mov({ id: 11, monto: 16000, created_at: '2026-10-02T15:00:00Z', vence: '2026-10-20' }),
      ],
      recargo: {
        aviso: null,
        sugeridos: [
          sugerido(),
          sugerido({
            fiado_id: 11,
            fiado_fecha: '2026-10-02',
            monto: 800,
            base: 16000,
            detalle: '5 % de $ 16.000 · mes 1',
          }),
        ],
        total: 1400,
      },
    });

  it('lista cada recargo con su fiado y su propio "No cobrar"', async () => {
    m.ficha.mockResolvedValue(conSugerencia());
    renderAt('/fiado/clientes/1');
    const tarjeta = await screen.findByRole('region', { name: 'Recargos para sumar' });
    expect(within(tarjeta).getByText('$ 1.400')).toBeDefined();
    expect(within(tarjeta).getByText('Fiado del 15 sept: $ 600')).toBeDefined();
    expect(within(tarjeta).getByText('Fiado del 2 oct: $ 800')).toBeDefined();
    expect(within(tarjeta).getAllByRole('button', { name: 'No cobrar' })).toHaveLength(2);
  });

  it('"No cobrar" saltea ese fiado y recarga la ficha', async () => {
    m.ficha.mockResolvedValueOnce(conSugerencia()).mockResolvedValue(ficha());
    m.omitirRecargo.mockResolvedValue(ficha());
    renderAt('/fiado/clientes/1');
    const tarjeta = await screen.findByRole('region', { name: 'Recargos para sumar' });
    fireEvent.click(
      within(tarjeta).getAllByRole('button', { name: 'No cobrar' })[1] as HTMLElement,
    );
    await waitFor(() => expect(m.omitirRecargo).toHaveBeenCalledWith(1, 11));
    await waitFor(() => expect(m.ficha).toHaveBeenCalledTimes(2));
  });

  it('"Sumar recargos" anota y va a Listo con el comprobante; "Deshacer" deshace cada uno', async () => {
    m.ficha.mockResolvedValue(conSugerencia());
    const recargoA = mov({
      id: 20,
      tipo: 'recargo',
      monto: 600,
      nota: '5 % de $ 12.000 · mes 1',
      recargo_de: 10,
      recargo_dias: 14,
      vence: null,
    });
    const recargoB = mov({
      id: 21,
      tipo: 'recargo',
      monto: 800,
      nota: '5 % de $ 16.000 · mes 1',
      recargo_de: 11,
      recargo_dias: 14,
      vence: null,
    });
    m.sumarRecargos.mockResolvedValue({
      movimientos: [recargoA, recargoB],
      cliente: cliente({ saldo: 29400, recargos_pendientes: 1400 }),
    });
    m.corregir.mockResolvedValue({});
    renderAt('/fiado/clientes/1');
    fireEvent.click(await screen.findByRole('button', { name: 'Sumar recargos' }));

    await waitFor(() => expect(screen.getByTestId('donde').textContent).toBe('/fiado/listo'));
    expect(m.sumarRecargos).toHaveBeenCalledWith(1, expect.any(String));
    expect(
      await screen.findByText('Sumaste $ 1.400 de recargos por atraso a Marta.'),
    ).toBeDefined();
    expect(
      await screen.findByText(/• \$ 600 por el fiado del 15 sept \(5 % de \$ 12\.000 · mes 1\)/),
    ).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Enviar por WhatsApp' }));
    expect(decodeURIComponent(String(open.mock.calls[0]?.[0]))).toContain(
      'sumé recargos por atraso',
    );
  });

  it('"Deshacer" después de sumar corrige cada recargo', async () => {
    const recargoA = mov({ id: 20, tipo: 'recargo', monto: 600, recargo_de: 10 });
    const recargoB = mov({ id: 21, tipo: 'recargo', monto: 800, recargo_de: 11 });
    m.corregir.mockResolvedValue({});
    render(
      <MemoryRouter
        initialEntries={[
          '/fiado/clientes/1',
          {
            pathname: '/fiado/listo',
            state: {
              tipo: 'recargo',
              resultado: { movimientos: [recargoA, recargoB], cliente: cliente({ saldo: 29400 }) },
              fiados: { 10: '2026-09-15', 11: '2026-10-02' },
            },
          },
        ]}
        initialIndex={1}
      >
        <HostApp modules={[fiado]} />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Sumaste $ 1.400 de recargos.')).toBeDefined();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
    });
    await waitFor(() => expect(m.corregir).toHaveBeenCalledTimes(2));
    expect(m.corregir.mock.calls.map((c) => c[0])).toEqual([20, 21]);
  });
});

describe('historial: recargos', () => {
  it('cada recargo dice de qué fiado es y se perdona con dos toques', async () => {
    const recargo = mov({
      id: 20,
      tipo: 'recargo',
      monto: 600,
      nota: '5 % de $ 12.000 · mes 1',
      created_at: '2026-10-29T15:00:00Z',
      vence: null,
      pendiente: 600,
      recargo_de: 10,
      recargo_dias: 14,
    });
    m.ficha.mockResolvedValue(ficha({ historial: [recargo, mov()] }));
    m.perdonarRecargo.mockResolvedValue({});
    renderAt('/fiado/clientes/1');

    expect(
      await screen.findByText(/del fiado del 15 sept · 5 % de \$ 12\.000 · mes 1/),
    ).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Perdonar' }));
    expect(m.perdonarRecargo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, perdonar' }));
    await waitFor(() => expect(m.perdonarRecargo).toHaveBeenCalledWith(20));
    expect(m.corregir).not.toHaveBeenCalled();
    expect(await screen.findByText(/Perdonaste el recargo de \$ 600/)).toBeDefined();
  });

  it('un recargo ya pagado o corregido no se puede perdonar', async () => {
    m.ficha.mockResolvedValue(
      ficha({
        historial: [
          mov({ id: 20, tipo: 'recargo', monto: 600, pendiente: 0, recargo_de: 10 }),
          mov({
            id: 21,
            tipo: 'recargo',
            monto: 800,
            pendiente: 800,
            corregido_por: 30,
            recargo_de: 10,
          }),
          mov(),
        ],
      }),
    );
    renderAt('/fiado/clientes/1');
    await screen.findAllByText('Recargo');
    expect(screen.queryByRole('button', { name: 'Perdonar' })).toBeNull();
  });
});

describe('ajustes: recargo por atraso', () => {
  it('borrador ⇄ configuración (coma decimal y último tramo sin fin)', () => {
    const b = borradorDe(null);
    expect(b.activo).toBe(false);
    expect(configDe(b)).toBeNull();
    expect(configDe({ ...b, activo: true, valor: '2,5' })).toEqual({
      esquema: 'mes',
      tipo: 'pct',
      valor: 2.5,
      tolerancia: 7,
      desde: 'vencimiento',
    });
    expect(configDe({ ...b, activo: true, esquema: 'tramos' })?.tramos).toEqual([
      { hasta: 30, pct: 5 },
      { hasta: 60, pct: 10 },
      { hasta: null, pct: 20 },
    ]);
  });

  it('prenderlo y guardar manda la configuración y avisa que hay que informar a los clientes', async () => {
    m.ajustes.mockResolvedValue(
      ajustes({ recargo: null, recargo_condiciones: null, recargo_version: 0 }),
    );
    m.guardarAjustes.mockResolvedValue(ajustes());
    renderAt('/fiado/ajustes');

    fireEvent.click(await screen.findByRole('switch', { name: /Sugerir recargos/ }));
    expect(screen.getByText(/Informarle es tu responsabilidad/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Por tramos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(m.guardarAjustes).toHaveBeenCalledWith(
        expect.objectContaining({
          recargo: expect.objectContaining({ esquema: 'tramos', tolerancia: 7 }),
        }),
      ),
    );
    expect(await screen.findByText(/te vamos a pedir que le avises las condiciones/)).toBeDefined();
  });

  it('prenderlo por primera vez pide aceptar los términos; cancelar lo deja apagado', async () => {
    m.ajustes.mockResolvedValue(
      ajustes({
        recargo: null,
        recargo_condiciones: null,
        recargo_version: 0,
        recargo_terminos_aceptados: false,
      }),
    );
    renderAt('/fiado/ajustes');

    const interruptor = await screen.findByRole('switch', { name: /Sugerir recargos/ });
    fireEvent.click(interruptor);
    const dialogo = screen.getByRole('dialog', { name: 'Antes de activar los recargos' });
    expect(
      within(dialogo)
        .getByRole('link', { name: 'Leer los términos completos' })
        .getAttribute('href'),
    ).toBe('/terminos#recargos');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(interruptor.getAttribute('aria-checked')).toBe('false');
  });

  it('aceptar los términos prende el recargo y los manda al guardar', async () => {
    m.ajustes.mockResolvedValue(
      ajustes({
        recargo: null,
        recargo_condiciones: null,
        recargo_version: 0,
        recargo_terminos_aceptados: false,
      }),
    );
    m.guardarAjustes.mockResolvedValue(ajustes());
    renderAt('/fiado/ajustes');

    const interruptor = await screen.findByRole('switch', { name: /Sugerir recargos/ });
    fireEvent.click(interruptor);
    const dialogo = screen.getByRole('dialog');
    const aceptar = within(dialogo).getByRole('button', { name: 'Aceptar y activar' });
    expect((aceptar as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(dialogo).getByRole('checkbox', { name: /Leí y acepto/ }));
    fireEvent.click(aceptar);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(interruptor.getAttribute('aria-checked')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(m.guardarAjustes).toHaveBeenCalledWith(
        expect.objectContaining({
          recargo: expect.objectContaining({ esquema: 'mes' }),
          terminos_recargo: '2026-10-30',
        }),
      ),
    );
  });

  it('con términos nuevos sin aceptar, guardar con recargos prendidos los pide antes', async () => {
    m.ajustes.mockResolvedValue(ajustes({ recargo_terminos_aceptados: false }));
    m.guardarAjustes.mockResolvedValue(ajustes());
    renderAt('/fiado/ajustes');

    fireEvent.click(await screen.findByRole('button', { name: 'Guardar cambios' }));
    const dialogo = screen.getByRole('dialog');
    expect(m.guardarAjustes).not.toHaveBeenCalled();
    fireEvent.click(within(dialogo).getByRole('checkbox', { name: /Leí y acepto/ }));
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Aceptar y activar' }));
    await waitFor(() =>
      expect(m.guardarAjustes).toHaveBeenCalledWith(
        expect.objectContaining({ terminos_recargo: '2026-10-30' }),
      ),
    );
  });

  it('ya aceptados, prender y guardar no muestra el diálogo ni reenvía la aceptación', async () => {
    m.ajustes.mockResolvedValue(
      ajustes({ recargo: null, recargo_condiciones: null, recargo_version: 0 }),
    );
    m.guardarAjustes.mockResolvedValue(ajustes());
    renderAt('/fiado/ajustes');
    fireEvent.click(await screen.findByRole('switch', { name: /Sugerir recargos/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(m.guardarAjustes).toHaveBeenCalled());
    expect(m.guardarAjustes.mock.calls[0]?.[0]).not.toHaveProperty('terminos_recargo');
  });

  it('por día muestra el equivalente mensual del porcentaje', () => {
    const b = { ...borradorDe(null), activo: true, esquema: 'dia' as const };
    expect(equivalenteMensual({ ...b, valor: '0,5' })).toBe('Equivale a 15 % por mes.');
    expect(equivalenteMensual({ ...b, tipo: 'fijo', valor: '50' })).toBeNull();
    expect(equivalenteMensual({ ...b, esquema: 'mes' })).toBeNull();
  });

  it('elegir "Por día" guarda ese esquema', async () => {
    m.guardarAjustes.mockResolvedValue(ajustes());
    renderAt('/fiado/ajustes');
    fireEvent.click(await screen.findByRole('button', { name: 'Por día' }));
    expect(screen.getByLabelText('Recargo por cada día de atraso (%)')).toBeDefined();
    expect(screen.getByText(/Equivale a 150 % por mes/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(m.guardarAjustes).toHaveBeenCalledWith(
        expect.objectContaining({ recargo: expect.objectContaining({ esquema: 'dia', valor: 5 }) }),
      ),
    );
  });

  it('apagado, guardar manda recargo: null', async () => {
    m.ajustes.mockResolvedValue(
      ajustes({ recargo: null, recargo_condiciones: null, recargo_version: 0 }),
    );
    m.guardarAjustes.mockResolvedValue(ajustes({ recargo: null }));
    renderAt('/fiado/ajustes');
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(m.guardarAjustes).toHaveBeenCalledWith(expect.objectContaining({ recargo: null })),
    );
  });
});

describe('anotar y editar con recargos', () => {
  it('a un cliente sin aviso no se le puede anotar un fiado (lleva a su ficha)', async () => {
    m.ficha.mockResolvedValue(ficha({ cliente: cliente({ aviso_recargo_pendiente: true }) }));
    renderAt('/fiado/anotar?cliente=1');
    expect(await screen.findByText(/avisale las condiciones de recargo/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Ir a su ficha para avisarle' }));
    expect(screen.getByTestId('donde').textContent).toBe('/fiado/clientes/1');
  });

  it('editar cliente: "No sugerir recargos" sólo con recargos activos, y se guarda', async () => {
    m.actualizarCliente.mockResolvedValue(cliente({ sin_recargo: true }));
    renderAt('/fiado/clientes/1/editar');
    fireEvent.click(await screen.findByRole('switch', { name: /No sugerir recargos/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(m.actualizarCliente).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ sin_recargo: true }),
      ),
    );
  });

  it('editar cliente sin recargos activos: no aparece la opción', async () => {
    m.ajustes.mockResolvedValue(ajustes({ recargo: null, recargo_condiciones: null }));
    renderAt('/fiado/clientes/1/editar');
    await screen.findByRole('button', { name: 'Guardar cambios' });
    expect(screen.queryByRole('switch', { name: /No sugerir recargos/ })).toBeNull();
  });
});

describe('inicio', () => {
  it('"Para cobrar hoy" marca con "Recargo" a quien tiene uno para decidir', async () => {
    m.resumen.mockResolvedValue({
      total: 28000,
      clientes_con_deuda: 1,
      para_cobrar: [{ ...cliente({ recargo_para_sumar: 600 }), recordado_hoy: false }],
      ultimos: [],
    });
    render(
      <MemoryRouter initialEntries={['/fiado']}>
        <HostApp modules={[fiado]} />
      </MemoryRouter>,
    );
    const lista = await screen.findByRole('list', { name: /Para cobrar hoy/ });
    expect(within(lista).getByText('Recargo')).toBeDefined();
  });
});
