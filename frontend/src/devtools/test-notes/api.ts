import { req } from '../../host/http';
import type { NewTestNote, NotePatch, TestNote } from './types';

/** Prefijo de la API de notas (la captura lo excluye para no registrarse a sí misma). */
export const TEST_NOTES_API = '/api/test-notes';

/** Cliente de `/api/test-notes` sobre el `req` del host (Bearer de Clerk). */
export const testNotesApi = {
  list: () => req<TestNote[]>('/test-notes'),
  create: (n: NewTestNote) =>
    req<TestNote>('/test-notes', { method: 'POST', body: JSON.stringify(n) }),
  update: (id: number, p: NotePatch) =>
    req<TestNote>(`/test-notes/${id}`, { method: 'PATCH', body: JSON.stringify(p) }),
  remove: (id: number) => req<{ id: number }>(`/test-notes/${id}`, { method: 'DELETE' }),
};

/**
 * Mensaje legible de un error de `req` (`"400 {\"error\":\"…\"}"`): el campo
 * `error` del cuerpo JSON si existe; si no, `fallback`.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const m = /^\d{3} ([\s\S]*)$/.exec(err.message);
  if (!m) return fallback;
  try {
    const body = JSON.parse(m[1] ?? '') as { error?: unknown } | null;
    return typeof body?.error === 'string' && body.error ? body.error : fallback;
  } catch {
    return fallback;
  }
}
