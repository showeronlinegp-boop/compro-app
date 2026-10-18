import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const UA_ANDROID =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36';
const UA_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';

function celu({ ua, standalone = false }: { ua: string; standalone?: boolean }) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
  window.matchMedia = vi.fn().mockReturnValue({ matches: standalone }) as never;
}

/** Módulo nuevo en cada test: el store vive a nivel de módulo. */
async function cargar() {
  vi.resetModules();
  const store = await import('./instalar');
  const ui = await import('./InstalarApp');
  store.escucharInstalacion();
  return { ...store, ...ui };
}

/** Simula el aviso de Chrome de que la app se puede instalar. */
function avisoDeChrome(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const e = new Event('beforeinstallprompt') as Event & Record<string, unknown>;
  e.prompt = vi.fn().mockResolvedValue(undefined);
  e.userChoice = Promise.resolve({ outcome });
  act(() => {
    window.dispatchEvent(e);
  });
  return e;
}

describe('instalar la app (nota #7)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('Android: sin aviso de Chrome no ofrece nada (ya instalada o no se puede)', async () => {
    celu({ ua: UA_ANDROID });
    const { TarjetaInstalar } = await cargar();
    const { container } = render(<TarjetaInstalar />);
    expect(container.innerHTML).toBe('');
  });

  it('Android: con el aviso, "Instalar" abre el cartel de Chrome y al aceptar desaparece', async () => {
    celu({ ua: UA_ANDROID });
    const { TarjetaInstalar } = await cargar();
    render(<TarjetaInstalar />);
    const e = avisoDeChrome('accepted');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Instalar' }));
    });

    expect(e.prompt).toHaveBeenCalledOnce();
    expect(screen.queryByText('Instalá Neggo en tu celu')).toBeNull();
    expect(localStorage.getItem('neggo.app-instalada')).toBe('1');
  });

  it('Android: si cancela el cartel no la marca como instalada', async () => {
    celu({ ua: UA_ANDROID });
    const { TarjetaInstalar } = await cargar();
    render(<TarjetaInstalar />);
    avisoDeChrome('dismissed');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Instalar' }));
    });

    expect(localStorage.getItem('neggo.app-instalada')).toBeNull();
  });

  it('iPhone: muestra los pasos y "Ya la agregué" la esconde para siempre', async () => {
    celu({ ua: UA_IPHONE });
    const { TarjetaInstalar } = await cargar();
    render(<TarjetaInstalar />);

    expect(screen.getByText('Agregar a inicio')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Ya la agregué' }));

    expect(screen.queryByText('Instalá Neggo en tu celu')).toBeNull();
    expect(localStorage.getItem('neggo.app-instalada')).toBe('1');
  });

  it('abierta desde el ícono (standalone) no aparece en ningún lado', async () => {
    celu({ ua: UA_IPHONE, standalone: true });
    const { TarjetaInstalar, OpcionInstalar } = await cargar();
    const { container } = render(
      <>
        <TarjetaInstalar />
        <OpcionInstalar />
      </>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('la ✕ oculta la tarjeta de Inicio pero la opción en "Más" sigue', async () => {
    celu({ ua: UA_IPHONE });
    const { TarjetaInstalar, OpcionInstalar } = await cargar();
    render(
      <>
        <TarjetaInstalar />
        <OpcionInstalar />
      </>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'No mostrar más' }));

    expect(screen.queryByText('Instalá Neggo en tu celu')).toBeNull();
    expect(screen.getByText('Instalar la app')).toBeDefined();
  });

  it('el evento appinstalled la marca como instalada', async () => {
    celu({ ua: UA_ANDROID });
    const { OpcionInstalar } = await cargar();
    render(<OpcionInstalar />);
    avisoDeChrome();
    expect(screen.getByText('Instalar la app')).toBeDefined();

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(screen.queryByText('Instalar la app')).toBeNull();
  });
});
