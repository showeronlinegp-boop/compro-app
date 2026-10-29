import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setTokenGetter } from './http';
import {
  ESPERA_MS,
  LOTE_MAX,
  enviarUso,
  registrarUso,
  reiniciarUso,
  useRegistrarPantallas,
} from './uso';

let fetchMock: ReturnType<typeof vi.fn>;

/** Body JSON del envío número `i`. */
const enviado = (i = 0) => JSON.parse(String(fetchMock.mock.calls[i]?.[1]?.body));

beforeEach(() => {
  reiniciarUso();
  fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
  setTokenGetter(async () => 'token-de-prueba');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setTokenGetter(null);
});

describe('registrarUso / enviarUso', () => {
  it('junta los eventos y los manda en un solo POST con sesión y keepalive', async () => {
    registrarUso('pantalla', 'fiado', 'inicio');
    registrarUso('comprobante', 'fiado');
    await enviarUso();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/uso/eventos');
    expect(opts).toMatchObject({ method: 'POST', keepalive: true });
    expect(opts.headers.Authorization).toBe('Bearer token-de-prueba');
    expect(enviado()).toEqual({
      eventos: [
        { evento: 'pantalla', modulo: 'fiado', ruta_id: 'inicio' },
        { evento: 'comprobante', modulo: 'fiado', ruta_id: null },
      ],
      standalone: false,
      movil: false,
    });
  });

  it('sin sesión no manda nada', async () => {
    setTokenGetter(async () => null);
    registrarUso('pantalla', 'fiado', 'inicio');
    await enviarUso();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('manda solo a los pocos segundos', async () => {
    vi.useFakeTimers();
    registrarUso('pantalla', 'fiado', 'inicio');
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(ESPERA_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('con el lote lleno manda en el momento', async () => {
    for (let i = 0; i < LOTE_MAX; i++) registrarUso('pantalla', 'fiado', `r${i}`);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(enviado().eventos).toHaveLength(LOTE_MAX);
  });

  it('la misma pantalla dos veces seguidas cuenta una', async () => {
    registrarUso('pantalla', 'fiado', 'inicio');
    registrarUso('pantalla', 'fiado', 'inicio');
    registrarUso('pantalla', 'fiado', 'clientes');
    registrarUso('pantalla', 'fiado', 'inicio');
    await enviarUso();
    expect(enviado().eventos.map((e: { ruta_id: string }) => e.ruta_id)).toEqual([
      'inicio',
      'clientes',
      'inicio',
    ]);
  });

  it('si falla la red no lanza', async () => {
    fetchMock.mockRejectedValue(new Error('sin red'));
    registrarUso('pantalla', 'fiado', 'inicio');
    await expect(enviarUso()).resolves.toBeUndefined();
  });

  it('al esconder la pestaña manda lo pendiente', async () => {
    registrarUso('pantalla', 'fiado', 'inicio');
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    vi.restoreAllMocks();
  });
});

describe('useRegistrarPantallas', () => {
  it('registra cada pantalla nueva por id de ruta, nunca por path', async () => {
    const { rerender } = renderHook(({ m, r }) => useRegistrarPantallas(m, r), {
      initialProps: { m: 'fiado' as string | undefined, r: 'ficha' as string | undefined },
    });
    rerender({ m: 'fiado', r: 'ficha' }); // re-render: no repite
    rerender({ m: undefined, r: undefined }); // ruta del host: nada
    rerender({ m: 'fiado', r: 'anotar' });
    await enviarUso();
    expect(enviado().eventos).toEqual([
      { evento: 'pantalla', modulo: 'fiado', ruta_id: 'ficha' },
      { evento: 'pantalla', modulo: 'fiado', ruta_id: 'anotar' },
    ]);
  });
});
