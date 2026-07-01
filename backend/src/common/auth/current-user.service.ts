import { Injectable, Scope } from '@nestjs/common';

/**
 * Request-scoped service that carries the resolved identity for the current
 * HTTP request. The ClerkAuthGuard populates it; downstream providers (repo
 * factories) and controllers read from it.
 *
 * Scope.REQUEST ensures a fresh instance per request — no cross-request bleed.
 */
export interface CurrentUser {
  clerkUserId: string;
  userId: number;
}

@Injectable({ scope: Scope.REQUEST })
export class CurrentUserService {
  private _user: CurrentUser | null = null;

  set(user: CurrentUser): void {
    this._user = user;
  }

  get(): CurrentUser {
    if (!this._user) {
      // Guard should always populate this before any handler runs.
      // If null here, it is a programming error — not a user-facing one.
      throw new Error('[CurrentUserService] User not resolved — guard may have been bypassed');
    }
    return this._user;
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
    return this._user !== null;
  }
}
