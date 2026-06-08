const BASE = '/api';

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

export const api = {
  products: {
    list:       (params) => req(`/products?${new URLSearchParams(params)}`),
    groups:     (params) => req(`/products/groups?${new URLSearchParams(params)}`),
    categories: ()       => req('/products/categories'),
  },
  interests: {
    list:   ()           => req('/interests'),
    add:    (product_id) => req('/interests', { method: 'POST', body: JSON.stringify({ product_id }) }),
    remove: (id)         => req(`/interests/${id}`, { method: 'DELETE' }),
  },
  shopping: {
    list:   ()           => req('/shopping'),
    weekly: ()           => req('/shopping/weekly'),
    add:    (data)       => req('/shopping', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data)   => req(`/shopping/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id)         => req(`/shopping/${id}`, { method: 'DELETE' }),
  },
  sync: {
    status:  ()  => req('/sync/status'),
    trigger: (s) => req(`/sync/${s}`, { method: 'POST' }),
  },
  enrich: {
    status:  ()  => req('/enrich/status'),
    trigger: (s) => req(`/enrich/${s}`, { method: 'POST' }),
    triggerAll: () => req('/enrich', { method: 'POST' }),
  },
};
