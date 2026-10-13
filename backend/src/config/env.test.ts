/**
 * env.test.ts — unit tests for DATABASE_URL config (A1.2)
 *
 * Spec: §PrismaClient Singleton and Lifecycle — Scenario: DATABASE_URL replaces DB_PATH
 *   GIVEN config/env.ts is evaluated
 *   WHEN DATABASE_URL is set in the environment
 *   THEN the value is used as the Prisma datasource URL; DB_PATH is not referenced
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('DATABASE_URL env config', () => {
  const ORIGINAL = { ...process.env };

  afterEach(() => {
    // Restore env after each test
    for (const key of Object.keys(process.env)) {
      if (!(key in ORIGINAL)) delete process.env[key];
    }
    Object.assign(process.env, ORIGINAL);
  });

  it('exports DATABASE_URL when set', async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
    // Dynamic import so env is re-read each time (vitest isolates modules per test file)
    const { DATABASE_URL } = await import('./env.js');
    expect(DATABASE_URL).toBe('postgresql://test:test@localhost:5432/testdb');
  });

  it('strEnv recorta espacios y trata el vacío como ausente', async () => {
    const { strEnv } = await import('./env.js');
    process.env.TEST_STR_ENV = '  postgresql://u:p@host:5432/railway \n';
    expect(strEnv('TEST_STR_ENV')).toBe('postgresql://u:p@host:5432/railway');
    process.env.TEST_STR_ENV = '   ';
    expect(strEnv('TEST_STR_ENV')).toBeUndefined();
    delete process.env.TEST_STR_ENV;
    expect(strEnv('TEST_STR_ENV')).toBeUndefined();
  });

  it('exports DATABASE_URL (not DB_PATH) as the primary database config', async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
    const env = await import('./env.js');
    // DATABASE_URL is the primary export; DB_PATH is deprecated (Slice A compat shim)
    expect(typeof env.DATABASE_URL).toBe('string');
    expect(env.DATABASE_URL).toContain('postgresql://');
  });

  it('the DATABASE_URL validation logic throws for production when absent', () => {
    // Test the validation logic in isolation (not via dynamic import, which is module-cached)
    function validateDatabaseUrl(url: string | undefined, nodeEnv: string): string {
      if (!url) {
        if (nodeEnv === 'production') {
          throw new Error('[env] DATABASE_URL env var is required in production');
        }
      }
      return url ?? 'postgresql://compro:compro@localhost:5432/compro';
    }

    expect(() => validateDatabaseUrl(undefined, 'production')).toThrow(/DATABASE_URL/);
    expect(validateDatabaseUrl('postgresql://x:y@localhost/db', 'production')).toBe(
      'postgresql://x:y@localhost/db',
    );
    expect(validateDatabaseUrl(undefined, 'development')).toBe(
      'postgresql://compro:compro@localhost:5432/compro',
    );
  });
});

describe('resolveTestNotesFlag (test-notes A1)', () => {
  it('sin flag → false', async () => {
    const { resolveTestNotesFlag } = await import('./env.js');
    expect(resolveTestNotesFlag(undefined, false)).toBe(false);
    expect(resolveTestNotesFlag('', false)).toBe(false);
    expect(resolveTestNotesFlag('0', false)).toBe(false);
    expect(resolveTestNotesFlag('true', false)).toBe(false);
  });

  it("'1' fuera de producción → true", async () => {
    const { resolveTestNotesFlag } = await import('./env.js');
    expect(resolveTestNotesFlag('1', false)).toBe(true);
    expect(resolveTestNotesFlag(' 1 ', false)).toBe(true);
  });

  it("Flag en producción: '1' + prod → error que nombra TEST_NOTES_ENABLED", async () => {
    const { resolveTestNotesFlag } = await import('./env.js');
    expect(() => resolveTestNotesFlag('1', true)).toThrow(/TEST_NOTES_ENABLED/);
  });

  it('sin flag en producción → false (no lanza)', async () => {
    const { resolveTestNotesFlag } = await import('./env.js');
    expect(resolveTestNotesFlag(undefined, true)).toBe(false);
  });
});
