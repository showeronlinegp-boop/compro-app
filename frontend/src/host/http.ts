// Núcleo HTTP del host: base de la API, token de Clerk y helpers de fetch.
// Los módulos construyen su cliente de dominio encima de req/reqOptional.

const BASE = '/api';

// ---------------------------------------------------------------------------
// Auth token bridge — populated by <AuthTokenBridge> via setApiToken().
// Storing the token in a module-level variable avoids React re-renders on
// every token refresh (vercel-react `rerender-use-ref-transient-values`).
// Clerk hooks MUST NOT be called here (http.ts is not a React component).
// ---------------------------------------------------------------------------

type TokenGetter = () => Promise<string | null>;
let _tokenGetter: TokenGetter | null = null;

/**
 * Registered once by <AuthTokenBridge>. Called per-request so every fetch
 * carries a fresh token with no mount-time race. Clerk's getToken() caches and
 * refreshes internally, and returns null when there is no active session (so
 * public requests simply carry no Authorization header).
 */
export function setTokenGetter(getter: TokenGetter | null): void {
  _tokenGetter = getter;
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!_tokenGetter) return {};
  const token = await _tokenGetter();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Single declared trust boundary: res.json() returns unknown; we assert T here only.
export async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    ...opts,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

/**
 * POST en segundo plano que sobrevive al cierre de la pestaña (`keepalive`).
 * Sólo con sesión: sin token no manda nada. Nunca lanza; si falla, se pierde.
 */
export async function postKeepalive(path: string, body: unknown): Promise<void> {
  try {
    const auth = await authHeaders();
    if (!auth.Authorization) return;
    await fetch(BASE + path, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify(body),
    });
  } catch {
    // Medición de uso: mejor perder un evento que molestar al usuario.
  }
}

// Like req<T> but returns null on 404/204 (resource not found / no content).
// Throws on any other non-ok status so callers get real errors surfaced.
export async function reqOptional<T>(path: string, opts: RequestInit = {}): Promise<T | null> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    ...opts,
  });
  if (res.status === 404 || res.status === 204) return null;
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}
