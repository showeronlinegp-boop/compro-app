import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';

/**
 * Identity shape attached to the Express request object by ClerkAuthGuard.
 */
export interface CurrentUser {
  clerkUserId: string;
  userId: number;
}

/**
 * Express request augmented with the resolved identity.
 * Used by ClerkAuthGuard (writes) and CurrentUserService (reads).
 */
export type RequestWithAuth = Request & { auth?: CurrentUser };

/**
 * Request-scoped service that exposes the resolved identity for the current
 * HTTP request. ClerkAuthGuard writes `request.auth`; this service reads it.
 *
 * Scope.REQUEST ensures a fresh instance per request — no cross-request bleed.
 * The guard stays singleton (no CurrentUserService dependency) so Reflector
 * resolution is correct for APP_GUARD.
 */
@Injectable({ scope: Scope.REQUEST })
export class CurrentUserService {
  constructor(@Inject(REQUEST) private readonly request: Request) {}

  get(): CurrentUser {
    const auth = (this.request as RequestWithAuth).auth;
    if (!auth) {
      // Guard should always populate request.auth before any handler runs.
      // If absent here, the guard was bypassed — this is a programming error.
      throw new Error('[CurrentUserService] User not resolved — guard may have been bypassed');
    }
    return auth;
  }

  /** Convenience accessor for the numeric local user id. */
  get userId(): number {
    return this.get().userId;
  }

  /** Convenience accessor for the Clerk user id. */
  get clerkUserId(): string {
    return this.get().clerkUserId;
  }

  /** True when a user has been set (useful in public routes that optionally read identity). */
  get isResolved(): boolean {
    return !!(this.request as RequestWithAuth).auth;
  }

  /**
   * Write identity onto the request — kept for test convenience.
   * Production code: ClerkAuthGuard writes request.auth directly.
   */
  set(user: CurrentUser): void {
    (this.request as RequestWithAuth).auth = user;
  }
}
