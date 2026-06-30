/**
 * auth-mock.ts — Shared test utilities for e2e tests that hit protected routes.
 *
 * Usage in test files:
 *
 *   import { vi } from 'vitest';
 *
 *   // ① At module top (before imports that load the guard):
 *   vi.mock('@clerk/backend', () => ({ verifyToken: vi.fn() }));
 *
 *   // ② Import verifyToken after vi.mock:
 *   import { verifyToken } from '@clerk/backend';
 *
 *   // ③ In beforeAll:
 *   import { setupClerkMock, TEST_AUTH_HEADER } from '../helpers/auth-mock.js';
 *   setupClerkMock(verifyToken as ReturnType<typeof vi.fn>);
 *
 *   // ④ Add the header to protected requests:
 *   request(app.getHttpServer()).get('/api/shopping').set(...TEST_AUTH_HEADER)
 */

import type { vi as Vi } from 'vitest';

/** CLERK_ISSUER value set in src/test/setup-env.ts */
export const TEST_CLERK_ISSUER = 'https://test.clerk.accounts.dev';

/** A stable Clerk user id used across all protected e2e tests. */
export const TEST_CLERK_USER_ID = 'clerk_e2e_test_user';

/** Authorization header pair to attach to protected requests. */
export const TEST_AUTH_HEADER: [string, string] = ['Authorization', 'Bearer e2e-test-token'];

/**
 * Configure the verifyToken mock to return a valid-looking payload
 * so ClerkAuthGuard accepts the request.
 *
 * @param mockFn - The vi.fn() mock for verifyToken from @clerk/backend
 */
export function setupClerkMock(mockFn: ReturnType<typeof Vi.fn>): void {
  mockFn.mockResolvedValue({
    sub: TEST_CLERK_USER_ID,
    iss: TEST_CLERK_ISSUER,
    email: 'e2e@test.example',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
}
