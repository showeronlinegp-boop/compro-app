/**
 * clerk-auth.guard.test.ts — Unit tests for ClerkAuthGuard.
 *
 * All external dependencies are mocked:
 *   - @clerk/backend verifyToken: mocked to resolve or reject
 *   - PrismaService: mocked (no real DB connection)
 *
 * ClerkAuthGuard is now singleton: constructor takes only Reflector + PrismaService.
 * On success it writes { clerkUserId, userId } to request.auth (RequestWithAuth).
 * CurrentUserService (request-scoped) reads from request.auth — not tested here.
 *
 * Scenarios covered:
 *   (a) Missing Authorization header → throws UnauthorizedException
 *   (b) Invalid/expired token (verifyToken rejects) → throws UnauthorizedException
 *   (c) Valid token + issuer match → upserts user, writes request.auth, returns true
 *   (d) @Public() route → bypasses guard, returns true without verifyToken call
 *   (e) Token with wrong issuer → throws UnauthorizedException
 */

import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClerkAuthGuard } from './clerk-auth.guard.js';
import type { RequestWithAuth } from './current-user.service.js';

// ---------------------------------------------------------------------------
// Mock @clerk/backend verifyToken
// ---------------------------------------------------------------------------
vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn(),
}));

// Mock env module — guard imports CLERK_SECRET_KEY and CLERK_ISSUER from here.
vi.mock('../../config/env.js', () => ({
  CLERK_SECRET_KEY: 'test_secret_key',
  CLERK_ISSUER: 'https://clerk.example.com',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  NODE_ENV: 'test',
  IS_PRODUCTION: false,
  CORS_ORIGIN: 'http://localhost:5173',
}));

import { verifyToken } from '@clerk/backend';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal mock ExecutionContext with an in-memory request. */
function buildContext(headers: Record<string, string> = {}): { ctx: ExecutionContext; request: RequestWithAuth } {
  const request: RequestWithAuth = { headers } as unknown as RequestWithAuth;

  const mockHandler = () => {};
  const mockClass = class {};

  const ctx = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => mockHandler,
    getClass: () => mockClass,
  } as unknown as ExecutionContext;

  return { ctx, request };
}

/** Build a Reflector that returns the given isPublic value. */
function buildReflector(isPublic: boolean): Reflector {
  return {
    getAllAndOverride: (_key: string) => (isPublic ? true : undefined),
  } as unknown as Reflector;
}

/** Build a mock PrismaService with a controllable users.upsert. */
function buildPrisma(userId = 42) {
  return {
    users: {
      upsert: vi.fn().mockResolvedValue({ id: userId }),
    },
  } as unknown as import('../../prisma/prisma.service.js').PrismaService;
}

/** Convenience: build a JWT payload with the given sub and iss. */
function buildPayload(sub: string, iss = 'https://clerk.example.com') {
  return { sub, iss, exp: Date.now() / 1000 + 3600 };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClerkAuthGuard', () => {
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(() => {
    prisma = buildPrisma();
    vi.mocked(verifyToken).mockReset();
  });

  it('(a) missing Authorization header → throws UnauthorizedException', async () => {
    const guard = new ClerkAuthGuard(buildReflector(false), prisma);
    const { ctx } = buildContext({}); // no Authorization header

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it('(a) Authorization header present but not Bearer format → throws UnauthorizedException', async () => {
    const guard = new ClerkAuthGuard(buildReflector(false), prisma);
    const { ctx } = buildContext({ authorization: 'Basic abc123' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it('(b) invalid/expired token (verifyToken rejects) → throws UnauthorizedException', async () => {
    vi.mocked(verifyToken).mockRejectedValue(new Error('Token expired'));
    const guard = new ClerkAuthGuard(buildReflector(false), prisma);
    const { ctx } = buildContext({ authorization: 'Bearer invalid.token.here' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(verifyToken).toHaveBeenCalledOnce();
  });

  it('(c) valid token → upserts user, writes request.auth, returns true', async () => {
    const clerkUserId = 'user_abc123';
    vi.mocked(verifyToken).mockResolvedValue(buildPayload(clerkUserId) as never);

    const guard = new ClerkAuthGuard(buildReflector(false), prisma);
    const { ctx, request } = buildContext({ authorization: 'Bearer valid.jwt.token' });

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(verifyToken).toHaveBeenCalledWith('valid.jwt.token', {
      secretKey: 'test_secret_key',
    });
    expect(prisma.users.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clerk_user_id: clerkUserId },
      }),
    );
    // Identity is written directly onto the request object
    expect(request.auth).toEqual({ clerkUserId, userId: 42 });
  });

  it('(d) @Public() route → bypasses guard entirely, returns true', async () => {
    const guard = new ClerkAuthGuard(buildReflector(true), prisma);
    const { ctx, request } = buildContext({}); // no token at all

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(verifyToken).not.toHaveBeenCalled();
    expect(prisma.users.upsert).not.toHaveBeenCalled();
    // request.auth must remain unset on public routes
    expect(request.auth).toBeUndefined();
  });

  it('(e) token with wrong issuer → throws UnauthorizedException', async () => {
    vi.mocked(verifyToken).mockResolvedValue(
      buildPayload('user_xyz', 'https://evil.example.com') as never,
    );
    const guard = new ClerkAuthGuard(buildReflector(false), prisma);
    const { ctx } = buildContext({ authorization: 'Bearer token.wrong.issuer' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    // Upsert must NOT run on issuer mismatch
    expect(prisma.users.upsert).not.toHaveBeenCalled();
  });
});
