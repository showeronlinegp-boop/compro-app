/**
 * setup-env.ts — Vitest per-fork setup that provides dummy auth/config env vars.
 *
 * config/env.ts is fail-closed: it throws if CLERK_SECRET_KEY / CLERK_ISSUER /
 * CORS_ORIGIN are absent (so a misconfigured production never boots without auth).
 * Tests do not have real Clerk credentials, so we inject harmless placeholders here.
 * Clerk token verification is mocked in the tests that exercise the auth guard;
 * these values only need to exist so module evaluation of env.ts succeeds.
 *
 * Uses ??= so a real value in the environment (e.g. CI secrets) always wins.
 */

process.env.CLERK_SECRET_KEY ??= 'sk_test_dummy_key_for_tests';
process.env.CLERK_ISSUER ??= 'https://test.clerk.accounts.dev';
process.env.CORS_ORIGIN ??= 'http://localhost:5173';
// Los tests cubren también compras; el arranque sin compras se prueba aparte.
process.env.ENABLE_COMPARADOR ??= 'true';
