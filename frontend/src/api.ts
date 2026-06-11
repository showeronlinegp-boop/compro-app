import type {
  EnrichStatus,
  GroupsResult,
  Interest,
  ProductListResult,
  ShoppingItem,
  SuperKey,
  SyncLog,
  TaxonomyEntry,
  WeeklyGroup,
} from './types/api';

const BASE = '/api';

// Single declared trust boundary: res.json() returns unknown; we assert T here only.
async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
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
    add: (data: { product_id: number; frequency_days: number }) =>
      req<{ id: number; product_id: number; already?: boolean }>('/shopping', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: number, data: { last_bought?: string | null; frequency_days?: number }) =>
      req<{ ok: boolean }>(`/shopping/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: number) => req<{ ok: boolean }>(`/shopping/${id}`, { method: 'DELETE' }),
  },
  sync: {
    status: () => req<SyncLog[]>('/sync/status'),
    trigger: (s: SuperKey) =>
      req<{ ok: boolean; message: string }>(`/sync/${s}`, { method: 'POST' }),
  },
  enrich: {
    status: () => req<Record<string, EnrichStatus>>('/enrich/status'),
    trigger: (s: SuperKey) =>
      req<{ ok: boolean; message: string }>(`/enrich/${s}`, { method: 'POST' }),
    triggerAll: () =>
      req<{ ok: boolean; message: string; supers: string[] }>('/enrich', { method: 'POST' }),
  },
};
