import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_NOTES_API, apiErrorMessage, testNotesApi } from './api';

describe('apiErrorMessage', () => {
  it('extrae `error` del cuerpo JSON de un error de req', () => {
    expect(apiErrorMessage(new Error('400 {"error":"El texto es obligatorio"}'), 'x')).toBe(
      'El texto es obligatorio',
    );
  });

  it('sin JSON, sin `error` o no-Error → fallback', () => {
    expect(apiErrorMessage(new Error('500 Internal Server Error'), 'No se pudo')).toBe(
      'No se pudo',
    );
    expect(apiErrorMessage(new Error('404 {"message":"x"}'), 'No se pudo')).toBe('No se pudo');
    expect(apiErrorMessage(new Error('Failed to fetch'), 'No se pudo')).toBe('No se pudo');
    expect(apiErrorMessage('raro', 'No se pudo')).toBe('No se pudo');
  });
});

describe('testNotesApi', () => {
  const fetchStub = vi.fn();
  const realFetch = window.fetch;

  beforeEach(() => {
    fetchStub.mockReset();
    fetchStub.mockImplementation(async () => new Response('{}', { status: 200 }));
    window.fetch = fetchStub as unknown as typeof window.fetch;
  });

  afterEach(() => {
    window.fetch = realFetch;
  });

  function lastCall(): [string, RequestInit] {
    return fetchStub.mock.calls.at(-1) as [string, RequestInit];
  }

  it('paths y métodos sobre /api/test-notes', async () => {
    await testNotesApi.list();
    expect(lastCall()[0]).toBe(TEST_NOTES_API);
    expect(lastCall()[1].method).toBeUndefined();

    await testNotesApi.create({
      tipo: 'error',
      texto: 'falla',
      modo: [],
      ruta: '/',
      pantalla: 'Inicio',
      contexto: { viewport: '1x1', userAgent: 'ua', errores: [], api: [] },
    });
    expect(lastCall()[0]).toBe(TEST_NOTES_API);
    expect(lastCall()[1].method).toBe('POST');
    expect(JSON.parse(String(lastCall()[1].body))).toMatchObject({ texto: 'falla' });

    await testNotesApi.update(7, { estado: 'corregida' });
    expect(lastCall()[0]).toBe(`${TEST_NOTES_API}/7`);
    expect(lastCall()[1].method).toBe('PATCH');
    expect(JSON.parse(String(lastCall()[1].body))).toEqual({ estado: 'corregida' });

    await testNotesApi.remove(7);
    expect(lastCall()[0]).toBe(`${TEST_NOTES_API}/7`);
    expect(lastCall()[1].method).toBe('DELETE');
  });

  it('un status no-ok se propaga como error legible', async () => {
    fetchStub.mockResolvedValue(new Response('{"error":"Nota no encontrada"}', { status: 404 }));
    const err = await testNotesApi.remove(9).catch((e: unknown) => e);
    expect(apiErrorMessage(err, 'x')).toBe('Nota no encontrada');
  });
});
