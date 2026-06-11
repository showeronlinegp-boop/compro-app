import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import App from '../App';

// Route-discriminating fetch stub — returns the correct shape per endpoint.
const EMPTY_PAGED = { data: [], total: 0, page: 1, pages: 1 };

function makeResponse(body: unknown) {
  return Promise.resolve({ ok: true, json: async () => body, text: async () => '' });
}

vi.stubGlobal(
  'fetch',
  vi.fn().mockImplementation((url: string) => {
    if (url.includes('/groups')) return makeResponse(EMPTY_PAGED);
    if (url.includes('/categories')) return makeResponse([]);
    if (url.includes('/interests')) return makeResponse([]);
    if (url.includes('/shopping')) return makeResponse([]);
    if (url.includes('/sync/status')) return makeResponse([]);
    if (url.includes('/enrich/status')) return makeResponse({});
    return makeResponse([]);
  }),
);

describe('App smoke test', () => {
  it('mounts without throwing', () => {
    const { container } = render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(container.textContent).not.toBe('');
  });
});
