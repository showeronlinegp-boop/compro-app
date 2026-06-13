/**
 * prisma-client.test.ts — unit tests for PrismaClient singleton (A4.1)
 *
 * Spec: §PrismaClient Singleton and Lifecycle
 *   Scenario: Duplicate PrismaClient instances are not created
 *     GIVEN the backend starts
 *     WHEN infrastructure/db module is imported multiple times in the same process
 *     THEN new PrismaClient() is called exactly once
 *
 * NOTE: Strict TDD mode — this test must FAIL (RED) before the implementation exists.
 * The file being tested is prisma-client.ts (not the existing client.ts).
 */

import { describe, it, expect } from 'vitest';

describe('PrismaClient singleton', () => {
  it('returns the same instance on multiple imports', async () => {
    // Both imports resolve to the same module-level singleton
    const mod1 = await import('./prisma-client.js');
    const mod2 = await import('./prisma-client.js');
    expect(mod1.prisma).toBe(mod2.prisma);
  });

  it('exports a prisma property', async () => {
    const mod = await import('./prisma-client.js');
    expect(mod.prisma).toBeDefined();
    expect(typeof mod.prisma).toBe('object');
  });

  it('exposes $disconnect method', async () => {
    const { prisma } = await import('./prisma-client.js');
    expect(typeof (prisma as { $disconnect?: unknown }).$disconnect).toBe('function');
  });
});
