import type {
  CartResult,
  CompareResult,
  EnrichStatus,
  GeoSuggestion,
  GroupsResult,
  Interest,
  OnboardingAnswers,
  ProductListResult,
  PromoOffer,
  ShoppingItem,
  ShoppingRecommendation,
  StoresResolveResult,
  SyncLog,
  TaxonomyEntry,
  UserProfile,
  WeeklyGroup,
} from './types/api';

const BASE = '/api';

// ---------------------------------------------------------------------------
// Auth token bridge — populated by <AuthTokenBridge> via setApiToken().
// Storing the token in a module-level variable avoids React re-renders on
// every token refresh (vercel-react `rerender-use-ref-transient-values`).
// Clerk hooks MUST NOT be called here (api.ts is not a React component).
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
async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    ...opts,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

// Like req<T> but returns null on 404/204 (resource not found / no content).
// Throws on any other non-ok status so callers get real errors surfaced.
async function reqOptional<T>(path: string, opts: RequestInit = {}): Promise<T | null> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    ...opts,
  });
  if (res.status === 404 || res.status === 204) return null;
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  products: {
    list: (params: Record<string, string>) =>
      req<ProductListResult>(`/products?${new URLSearchParams(params)}`),
    groups: (params: Record<string, string>) =>
      req<GroupsResult>(`/products/groups?${new URLSearchParams(params)}`),
    categories: () => req<TaxonomyEntry[]>('/products/categories'),
  },
  interests: {
    list: () => req<Interest[]>('/interests'),
    add: (product_id: number) =>
      req<{ id: number; product_id: number; already?: boolean }>('/interests', {
        method: 'POST',
        body: JSON.stringify({ product_id }),
      }),
    remove: (id: number) => req<{ ok: boolean }>(`/interests/${id}`, { method: 'DELETE' }),
  },
  shopping: {
    list: () => req<ShoppingItem[]>('/shopping'),
    weekly: () => req<WeeklyGroup[]>('/shopping/weekly'),
    recommendations: () => req<ShoppingRecommendation[]>('/shopping/recommendations'),
    compare: () => req<CompareResult>('/compare'),
    add: (data: { product_id: number; frequency_days: number }) =>
      req<{ id: number; product_id: number; already?: boolean }>('/shopping', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (
      id: number,
      data: { last_bought?: string | null; frequency_days?: number; product_id?: number },
    ) => req<{ ok: boolean }>(`/shopping/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: number) => req<{ ok: boolean }>(`/shopping/${id}`, { method: 'DELETE' }),
  },
  profile: {
    get: () => reqOptional<UserProfile>('/profile').catch(() => null),
    onboarding: (answers: OnboardingAnswers) =>
      req<{ profile: UserProfile; generated: number }>('/profile/onboarding', {
        method: 'POST',
        body: JSON.stringify(answers),
      }),
    resolveStores: (lat: number, lng: number) =>
      req<StoresResolveResult>(`/profile/location/stores?lat=${lat}&lng=${lng}`),
    setLocation: (lat: number, lng: number, location_name?: string) =>
      req<UserProfile>('/profile/location', {
        method: 'PUT',
        body: JSON.stringify({ lat, lng, location_name }),
      }),
    searchLocations: (q: string) =>
      req<GeoSuggestion[]>(`/profile/location/search?q=${encodeURIComponent(q)}`),
    clear: () => req<{ ok: boolean }>('/profile', { method: 'DELETE' }),
  },
  sync: {
    // POST /sync/* removed (Decision 5): use `npm run ops sync [super]` for manual triggers.
    status: () => req<SyncLog[]>('/sync/status'),
  },
  enrich: {
    // POST /enrich/* removed (Decision 5): use `npm run ops enrich [super]` for manual triggers.
    status: () => req<Record<string, EnrichStatus>>('/enrich/status'),
  },
  promos: {
    list: () => req<PromoOffer[]>('/promos'),
    // POST /promos/capture removed (Decision 5): use `npm run ops promos` for manual triggers.
  },
  cart: {
    get: () => req<CartResult>('/cart'),
    addItem: (product_id: number, quantity = 1) =>
      req<CartResult>('/cart/items', {
        method: 'POST',
        body: JSON.stringify({ product_id, quantity }),
      }),
    updateQty: (cart_item_id: number, quantity: number) =>
      req<CartResult>(`/cart/items/${cart_item_id}`, {
        method: 'PUT',
        body: JSON.stringify({ quantity }),
      }),
    removeItem: (cart_item_id: number) =>
      req<CartResult>(`/cart/items/${cart_item_id}`, { method: 'DELETE' }),
    clear: () => req<CartResult>('/cart', { method: 'DELETE' }),
    compare: () => req<CompareResult>('/cart/compare'),
  },
};
