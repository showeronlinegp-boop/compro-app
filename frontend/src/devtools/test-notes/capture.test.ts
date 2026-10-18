import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CAPTURE_MAX,
  installCapture,
  pushLimited,
  snapshotContext,
  toMessage,
  uninstallCapture,
} from './capture';

const ignore = (u: string) => u.includes('/api/test-notes');

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('pushLimited y toMessage', () => {
  it('pushLimited descarta lo más viejo', () => {
    const lista: number[] = [];
    for (let i = 1; i <= 5; i++) pushLimited(lista, i, 3);
    expect(lista).toEqual([3, 4, 5]);
  });

  it('toMessage resume errores, strings y objetos (máx. 400)', () => {
    expect(toMessage([new TypeError('x is null'), 'en', { a: 1 }])).toBe(
      'TypeError: x is null en {"a":1}',
    );
    expect(toMessage(['a'.repeat(1000)])).toHaveLength(400);
  });
});

describe('installCapture', () => {
  const realFetch = window.fetch;
  const realError = console.error;
  let fetchStub: ReturnType<typeof vi.fn>;
  let errorStub: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchStub = vi.fn();
    errorStub = vi.fn();
    window.fetch = fetchStub as unknown as typeof window.fetch;
    console.error = errorStub as unknown as typeof console.error;
  });

  afterEach(() => {
    uninstallCapture();
    window.fetch = realFetch;
    console.error = realError;
  });

  it('API fallida: registra método, url, status y error; el llamador recibe la misma respuesta', async () => {
    const res = json(500, { error: 'x' });
    fetchStub.mockResolvedValue(res);
    installCapture({ ignore });
    const got = await fetch('/api/cart');
    expect(got).toBe(res);
    expect(await got.json()).toEqual({ error: 'x' });
    expect(snapshotContext().api).toEqual([
      expect.objectContaining({ metodo: 'GET', url: '/api/cart', status: 500, error: 'x' }),
    ]);
  });

  it('método del init y respuestas ok no se registran', async () => {
    fetchStub.mockResolvedValueOnce(json(200, {})).mockResolvedValueOnce(json(400, {}));
    installCapture({ ignore });
    await fetch('/api/cart', { method: 'post' });
    await fetch('/api/cart', { method: 'delete' });
    expect(snapshotContext().api).toEqual([
      expect.objectContaining({ metodo: 'DELETE', status: 400, error: '' }),
    ]);
  });

  it('Llamada propia excluida por parámetro', async () => {
    fetchStub.mockResolvedValue(json(400, { error: 'no' }));
    installCapture({ ignore });
    await fetch('/api/test-notes');
    expect(snapshotContext().api).toEqual([]);
  });

  it('fuera de /api/ no se registra', async () => {
    fetchStub.mockResolvedValue(json(404, {}));
    installCapture({ ignore });
    await fetch('/icon.svg');
    expect(snapshotContext().api).toEqual([]);
  });

  it('sin respuesta: registra y relanza el error', async () => {
    fetchStub.mockRejectedValue(new TypeError('Failed to fetch'));
    installCapture({ ignore });
    await expect(fetch('/api/promos')).rejects.toThrow('Failed to fetch');
    expect(snapshotContext().api).toEqual([
      expect.objectContaining({
        url: '/api/promos',
        status: 'sin respuesta',
        error: 'Failed to fetch',
      }),
    ]);
  });

  it('idempotente: instalar dos veces no duplica registros', async () => {
    fetchStub.mockResolvedValue(json(500, {}));
    installCapture({ ignore });
    installCapture({ ignore });
    await fetch('/api/cart');
    console.error('una vez');
    expect(snapshotContext().api).toHaveLength(1);
    expect(snapshotContext().errores).toHaveLength(1);
    expect(errorStub).toHaveBeenCalledTimes(1);
  });

  it('console.error original preservado y registrado', () => {
    installCapture({ ignore });
    console.error('falló', new Error('boom'));
    expect(errorStub).toHaveBeenCalledWith('falló', expect.any(Error));
    expect(snapshotContext().errores).toEqual([
      expect.objectContaining({ tipo: 'console.error', mensaje: 'falló Error: boom' }),
    ]);
  });

  it('errores no capturados de window', () => {
    installCapture({ ignore });
    window.dispatchEvent(new ErrorEvent('error', { message: 'kaput' }));
    expect(snapshotContext().errores).toEqual([
      expect.objectContaining({ tipo: 'error', mensaje: 'kaput' }),
    ]);
  });

  it(`límite de ${CAPTURE_MAX}: conserva los últimos`, () => {
    installCapture({ ignore });
    for (let i = 1; i <= 20; i++) console.error(`e${i}`);
    const { errores } = snapshotContext();
    expect(errores).toHaveLength(CAPTURE_MAX);
    expect(errores[0]?.mensaje).toBe('e6');
    expect(errores[CAPTURE_MAX - 1]?.mensaje).toBe('e20');
  });

  it('uninstallCapture restaura fetch y console.error', () => {
    installCapture({ ignore });
    expect(window.fetch).not.toBe(fetchStub);
    uninstallCapture();
    expect(window.fetch).toBe(fetchStub);
    expect(console.error).toBe(errorStub);
  });
});
