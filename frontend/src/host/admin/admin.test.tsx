import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HostApp } from '../HostApp';
import type { AppModule } from '../contract';
import type { UsoReporte } from './api';
import { fechaCorta, haceCuanto, lunesAR, porcentaje, semanaCorta } from './formato';
import { LineasSemanales, topeEje } from './graficos';
import { reiniciarEsAdmin } from './useEsAdmin';

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

const api = vi.hoisted(() => ({ uso: vi.fn(), acceso: vi.fn() }));
vi.mock('./api', () => ({ adminApi: api }));

const Vacia = () => null;
const fiadoFalso: AppModule = {
  id: 'fiado',
  label: 'Fiado',
  basePath: '/fiado',
  routes: [
    { id: 'inicio', path: '', component: Vacia, auth: 'public', title: 'Inicio' },
    { id: 'ficha', path: 'clientes/:id', component: Vacia, auth: 'public', title: 'Cliente' },
  ],
};

function reporte(over: Partial<UsoReporte> = {}): UsoReporte {
  const semana = (s: string, activos: number, abrieron: number) => ({
    semana: s,
    altas: 1,
    activos,
    abrieron,
    por_accion: { cliente: 0, fiado: activos, pago: 0, correccion: 0, recordatorio: 0 },
  });
  return {
    generado_at: '2026-10-29T15:00:00Z',
    ingresos: 'clerk',
    eventos_desde: '2026-10-20T15:00:00Z',
    totales: {
      comercios: 9,
      activos_7d: 4,
      activos_30d: 6,
      ingresaron_7d: 5,
      abrieron_7d: 7,
      usan_instalada: 2,
      usan_celular: 8,
    },
    embudo: [
      { paso: 'Se registró', comercios: 9 },
      { paso: 'Anotó un fiado', comercios: 6 },
    ],
    adopcion: [
      { funcion: 'Recordatorios', comercios: 2, de: 6 },
      { funcion: 'Registrar pagos', comercios: 5, de: 6 },
    ],
    semanal: [semana('2026-10-12', 2, 0), semana('2026-10-19', 3, 5), semana('2026-10-26', 4, 7)],
    cohortes: [
      { semana: '2026-10-12', comercios: 2, retencion: [2, 1, 1] },
      { semana: '2026-10-19', comercios: 0, retencion: [0, 0] },
      { semana: '2026-10-26', comercios: 1, retencion: [1] },
    ],
    pantallas: [
      { modulo: 'fiado', ruta_id: 'inicio', vistas: 40, comercios: 7 },
      { modulo: 'fiado', ruta_id: 'vieja', vistas: 1, comercios: 1 },
    ],
    comercios: [
      {
        user_id: 1,
        email: 'kiosco@x.com',
        comercio: 'Kiosco Lu',
        alta: '2026-10-13T15:00:00Z',
        clientes: 12,
        fiados: 30,
        pagos: 10,
        recordatorios: 3,
        comprobantes: 4,
        instalada: true,
        ultima_actividad: '2026-10-29T12:00:00Z',
        ultima_vista: '2026-10-29T12:00:00Z',
        ultimo_ingreso: null,
        ultimo_login: null,
      },
    ],
    ...over,
  };
}

/** Valor de la celda de totales con ese label. */
const celda = (label: string) =>
  screen.getByText(label, { selector: 'dt' }).nextSibling?.textContent;

function Donde() {
  return <span data-testid="donde">{useLocation().pathname}</span>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <HostApp modules={[fiadoFalso]} tools={[]} />
      <Donde />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  reiniciarEsAdmin();
  api.uso.mockResolvedValue(reporte());
  api.acceso.mockResolvedValue(false);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Panel de uso', () => {
  it('muestra el número principal, los totales y las secciones', async () => {
    renderAt('/admin');
    const bajada = await screen.findByText(/de 9 registrados/);
    expect(bajada.previousElementSibling?.textContent).toBe('4');
    expect(celda('Abrieron la app')).toBe('7');
    expect(celda('Entraron (Clerk)')).toBe('5');
    expect(celda('Altas del período')).toBe('3');
    expect(api.uso).toHaveBeenCalledWith(12);

    for (const titulo of [
      'Semana por semana',
      'Hasta dónde llegan',
      'Qué funciones usan',
      'Pantallas más abiertas',
      'Cuántos vuelven',
      'Comercios',
    ]) {
      expect(screen.getByRole('heading', { name: titulo })).toBeDefined();
    }
  });

  it('barras: embudo con porcentaje, adopción ordenada y pantallas con su nombre', async () => {
    renderAt('/admin');
    const embudo = await screen.findByRole('list', { name: 'Embudo de activación' });
    expect(within(embudo).getByText('6 · 67 %')).toBeDefined();

    const adopcion = screen.getByRole('list', { name: 'Uso de cada función' });
    const items = within(adopcion)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(items).toEqual(['Registrar pagos5 de 6 · 83 %', 'Recordatorios2 de 6 · 33 %']);

    const pantallas = screen.getByRole('list', { name: 'Pantallas más abiertas' });
    expect(within(pantallas).getByText('Fiado · Inicio')).toBeDefined();
    expect(within(pantallas).getByText('Fiado · vieja')).toBeDefined();
    expect(within(pantallas).getByText('7 · 40 veces')).toBeDefined();
    expect(within(pantallas).getByText('1 · 1 vez')).toBeDefined();
  });

  it('retención: sin las semanas sin altas, en porcentaje', async () => {
    renderAt('/admin');
    const tabla = await screen.findByRole('table', { name: /Porcentaje de comercios/ });
    const filas = within(tabla).getAllByRole('row').slice(1);
    expect(filas).toHaveLength(2);
    expect(filas[0]?.textContent).toBe('12/1021005050');
  });

  it('la tabla de semanas muestra "—" en aperturas antes de que se midieran', async () => {
    renderAt('/admin');
    fireEvent.click(await screen.findByText('Ver como tabla'));
    const tabla = screen.getAllByRole('table')[0] as HTMLElement;
    const filas = within(tabla)
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.textContent);
    expect(filas).toEqual(['26/10147', '19/10135', '12/1012—']);
    expect(screen.getByText(/Las aperturas se miden desde el 20\/10\/26/)).toBeDefined();
  });

  it('lista de comercios con nombre, mail y última actividad', async () => {
    renderAt('/admin');
    const lista = await screen.findByRole('list', { name: 'Comercios' });
    expect(within(lista).getByText('Kiosco Lu')).toBeDefined();
    expect(within(lista).getByText('kiosco@x.com')).toBeDefined();
    expect(within(lista).getByText(/Alta 13\/10\/26 · app instalada/)).toBeDefined();
    expect(within(lista).getByText('12')).toBeDefined();
  });

  it('cambiar el período vuelve a pedir el reporte', async () => {
    renderAt('/admin');
    fireEvent.click(await screen.findByRole('button', { name: '4 semanas' }));
    await waitFor(() => expect(api.uso).toHaveBeenLastCalledWith(4));
    expect(screen.getByRole('button', { name: '4 semanas' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('sin Clerk y sin eventos: avisa y no dibuja la serie de aperturas', async () => {
    api.uso.mockResolvedValue(
      reporte({
        ingresos: 'no_disponible',
        eventos_desde: null,
        totales: { ...reporte().totales, ingresaron_7d: null },
      }),
    );
    renderAt('/admin');
    expect(await screen.findByText(/Clerk no respondió/)).toBeDefined();
    expect(celda('Entraron (Clerk)')).toBe('—');
    expect(screen.getByText(/aperturas todavía no tienen registros/)).toBeDefined();
    expect(screen.queryByText('Abrieron la app', { selector: 'figcaption *' })).toBeNull();
  });

  it('403: dice que es solo para administradores', async () => {
    api.uso.mockRejectedValue(new Error('403 {"error":"Solo para administradores"}'));
    renderAt('/admin');
    expect(await screen.findByText('Esta pantalla es solo para administradores.')).toBeDefined();
  });

  it('otro error: permite reintentar', async () => {
    api.uso.mockRejectedValueOnce(new Error('500 boom'));
    renderAt('/admin');
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText(/de 9 registrados/)).toBeDefined();
    expect(api.uso).toHaveBeenCalledTimes(2);
  });

  it('vacío: cada sección dice que todavía no hay datos', async () => {
    api.uso.mockResolvedValue(
      reporte({
        adopcion: [],
        pantallas: [],
        cohortes: [],
        comercios: [],
        embudo: [{ paso: 'Se registró', comercios: 0 }],
      }),
    );
    renderAt('/admin');
    expect(await screen.findByText('Todavía ningún comercio anotó un fiado.')).toBeDefined();
    expect(screen.getByText('Todavía no hay pantallas registradas en este período.')).toBeDefined();
    expect(screen.getByText('No hubo altas en este período.')).toBeDefined();
    expect(screen.getByText('Todavía no se registró ningún comercio.')).toBeDefined();
  });
});

describe('Acceso desde "Más"', () => {
  it('un admin ve "Panel de uso" y entra', async () => {
    api.acceso.mockResolvedValue(true);
    renderAt('/mas');
    fireEvent.click(await screen.findByRole('button', { name: /Panel de uso/ }));
    expect(screen.getByTestId('donde').textContent).toBe('/admin');
  });

  it('un comercio no ve la opción', async () => {
    renderAt('/mas');
    await waitFor(() => expect(api.acceso).toHaveBeenCalled());
    expect(screen.queryByRole('heading', { name: 'Administración' })).toBeNull();
  });
});

describe('LineasSemanales', () => {
  const semanas = ['2026-10-12', '2026-10-19', '2026-10-26'];
  const series = [
    { nombre: 'Anotaron algo', fondo: 'bg-chart-1', trazo: 'var(--chart-1)', valores: [2, 3, 4] },
    {
      nombre: 'Abrieron la app',
      fondo: 'bg-chart-2',
      trazo: 'var(--chart-2)',
      valores: [null, 5, 9],
    },
  ];

  it('con las flechas recorre las semanas y el tooltip lista todas las series', () => {
    render(<LineasSemanales semanas={semanas} series={series} />);
    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('aria-valuetext')).toBe(
      'Semana del 26/10: 4 anotaron algo, 9 abrieron la app',
    );
    act(() => {
      slider.focus();
      fireEvent.keyDown(slider, { key: 'ArrowLeft' });
      fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    });
    const tooltip = screen.getByRole('status');
    expect(tooltip.textContent).toContain('Semana del 12/10');
    expect(tooltip.textContent).toContain('2Anotaron algo');
    expect(tooltip.textContent).toContain('—Abrieron la app');
    fireEvent.keyDown(slider, { key: 'Escape' });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('leyenda con las dos series', () => {
    render(<LineasSemanales semanas={semanas} series={series} />);
    const leyenda = screen.getByRole('figure').querySelector('figcaption');
    expect(leyenda?.textContent).toBe('Anotaron algoAbrieron la app');
  });
});

describe('formatos y eje', () => {
  it('topeEje da 4 divisiones enteras y redondas', () => {
    expect(topeEje(0)).toBe(4);
    expect(topeEje(3)).toBe(4);
    expect(topeEje(7)).toBe(8);
    expect(topeEje(13)).toBe(20);
    expect(topeEje(37)).toBe(40);
    expect(topeEje(130)).toBe(200);
  });

  it('fechas cortas en hora argentina', () => {
    expect(semanaCorta('2026-10-26')).toBe('26/10');
    expect(fechaCorta('2026-10-29T02:00:00Z')).toBe('28/10/26'); // 23 h del 28 en AR
    expect(lunesAR('2026-10-26T02:00:00Z')).toBe('2026-10-19'); // domingo 23 h AR
    expect(lunesAR('2026-10-29T15:00:00Z')).toBe('2026-10-26');
  });

  it('haceCuanto y porcentaje', () => {
    const ahora = new Date('2026-10-29T15:00:00Z');
    expect(haceCuanto(null, ahora)).toBe('nunca');
    expect(haceCuanto('2026-10-29T03:30:00Z', ahora)).toBe('hoy');
    expect(haceCuanto('2026-10-28T12:00:00Z', ahora)).toBe('ayer');
    expect(haceCuanto('2026-10-20T12:00:00Z', ahora)).toBe('hace 9 días');
    expect(porcentaje(2, 3)).toBe('67 %');
    expect(porcentaje(1, 0)).toBe('—');
  });
});
