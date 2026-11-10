import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HostApp } from '../../host/HostApp';
import { datosDeContacto, hayContactos } from './contactos';
import { fiado } from './index';

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
  ajustes: vi.fn(),
  crearCliente: vi.fn(),
  guardarAjustes: vi.fn(),
}));

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, fiadoApi: { ...actual.fiadoApi, ...m } };
});

/** Simula Chrome en Android: `navigator.contacts` + `window.ContactsManager`. */
function conAgenda(select: (...args: unknown[]) => Promise<unknown>) {
  Object.defineProperty(navigator, 'contacts', { value: { select }, configurable: true });
  Object.defineProperty(window, 'ContactsManager', { value: class {}, configurable: true });
}

function sinAgenda() {
  Reflect.deleteProperty(navigator, 'contacts');
  Reflect.deleteProperty(window, 'ContactsManager');
}

function renderAt(path: string) {
  m.ajustes.mockResolvedValue({ comercio: '', recargo: null });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <HostApp modules={[fiado]} />
    </MemoryRouter>,
  );
}

const BOTON = { name: 'Elegir de mis contactos' };

afterEach(() => {
  cleanup();
  sinAgenda();
  vi.clearAllMocks();
});

describe('datos del contacto', () => {
  it('toma el primer nombre y teléfono con texto, recortados', () => {
    expect(
      datosDeContacto({ name: ['', ' Rosa Pérez '], tel: ['', '+54 9 11 5555-0000'] }),
    ).toEqual({ nombre: 'Rosa Pérez', telefono: '+54 9 11 5555-0000' });
    expect(datosDeContacto({ name: ['Rosa'] })).toEqual({ nombre: 'Rosa', telefono: '' });
    expect(datosDeContacto({ name: [], tel: [] })).toBeNull();
    expect(datosDeContacto(undefined)).toBeNull();
    expect(datosDeContacto({ name: ['x'.repeat(100)] })?.nombre).toHaveLength(80);
  });
});

describe('Elegir de mis contactos', () => {
  it('sin soporte (iPhone, compu) el botón no aparece', async () => {
    expect(hayContactos()).toBe(false);
    renderAt('/fiado/clientes/nuevo');
    await act(async () => {});
    expect(screen.queryByRole('button', BOTON)).toBeNull();
  });

  it('en el alta completa nombre y teléfono con el contacto elegido', async () => {
    const select = vi.fn().mockResolvedValue([{ name: ['Rosa'], tel: ['11 5555-0000'] }]);
    conAgenda(select);
    renderAt('/fiado/clientes/nuevo');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', BOTON));
    });
    expect(select).toHaveBeenCalledWith(['name', 'tel'], { multiple: false });
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Rosa');
    expect((screen.getByLabelText('Teléfono (opcional)') as HTMLInputElement).value).toBe(
      '11 5555-0000',
    );
  });

  it('si cierra la agenda sin elegir, no toca lo escrito', async () => {
    conAgenda(vi.fn().mockRejectedValue(new DOMException('cancelado', 'AbortError')));
    renderAt('/fiado/clientes/nuevo');
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Pepe' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', BOTON));
    });
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Pepe');
  });

  it('también está en la bienvenida', async () => {
    conAgenda(vi.fn().mockResolvedValue([{ name: ['Rosa'], tel: ['11 5555-0000'] }]));
    renderAt('/fiado/bienvenida');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', BOTON));
    });
    const nombre = screen.getByLabelText('¿Quién te debe más?') as HTMLInputElement;
    expect(nombre.value).toBe('Rosa');
    expect((screen.getByLabelText('Su teléfono (opcional)') as HTMLInputElement).value).toBe(
      '11 5555-0000',
    );
  });

  it('no aparece al editar un cliente', async () => {
    conAgenda(vi.fn());
    renderAt('/fiado/clientes/1/editar');
    await act(async () => {});
    expect(screen.queryByRole('button', BOTON)).toBeNull();
  });
});
