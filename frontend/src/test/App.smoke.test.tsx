import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import App from '../App';

// ---------------------------------------------------------------------------
// Mock @clerk/clerk-react so the smoke test never hits a real Clerk instance.
// All Clerk components are replaced with minimal stubs that render their
// children (or nothing), keeping the test isolated from the auth service.
// ---------------------------------------------------------------------------
vi.mock('@clerk/clerk-react', () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
  SignedIn: ({ children }: { children: ReactNode }) => children,
  SignedOut: (_props: { children: ReactNode }) => null,
  RedirectToSignIn: () => null,
  UserButton: () => null,
  useAuth: () => ({ isSignedIn: true, getToken: async () => 'test-token' }),
  SignIn: () => null,
  SignUp: () => null,
}));

// ---------------------------------------------------------------------------
// Route-discriminating fetch stub — returns the correct shape per endpoint.
// ---------------------------------------------------------------------------
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

// App uses <Routes> internally; MemoryRouter provides the history context.
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
