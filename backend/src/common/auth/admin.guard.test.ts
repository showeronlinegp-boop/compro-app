import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AdminGuard, esAdmin } from './admin.guard.js';
import type { RequestWithAuth } from './current-user.service.js';

function ctx(clerkUserId?: string): ExecutionContext {
  const request = {
    auth: clerkUserId ? { clerkUserId, userId: 1 } : undefined,
  } as unknown as RequestWithAuth;
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('esAdmin', () => {
  it('sólo los ids de la lista', () => {
    expect(esAdmin('user_a', ['user_a'])).toBe(true);
    expect(esAdmin('user_b', ['user_a'])).toBe(false);
    expect(esAdmin(undefined, ['user_a'])).toBe(false);
  });

  it('lista vacía → nadie es admin', () => {
    expect(esAdmin('user_a', [])).toBe(false);
  });
});

describe('AdminGuard', () => {
  it('deja pasar a un admin', () => {
    expect(new AdminGuard(['user_a']).canActivate(ctx('user_a'))).toBe(true);
  });

  it('403 a un usuario con sesión que no es admin', () => {
    expect(() => new AdminGuard(['user_a']).canActivate(ctx('user_b'))).toThrow(ForbiddenException);
  });

  it('403 si no hay identidad resuelta', () => {
    expect(() => new AdminGuard(['user_a']).canActivate(ctx())).toThrow(ForbiddenException);
  });
});
