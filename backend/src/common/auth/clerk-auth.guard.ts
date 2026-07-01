import { verifyToken } from '@clerk/backend';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS emitDecoratorMetadata requires value import for DI
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { CLERK_ISSUER, CLERK_SECRET_KEY } from '../../config/env.js';
// biome-ignore lint/style/useImportType: NestJS emitDecoratorMetadata requires value import for DI
import { PrismaService } from '../../prisma/prisma.service.js';
// biome-ignore lint/style/useImportType: NestJS emitDecoratorMetadata requires value import for DI
import { CurrentUserService } from './current-user.service.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';

/**
 * Global APP_GUARD. Default-deny: every route requires a valid Clerk JWT
 * unless decorated with @Public().
 *
 * On success:
 *   1. Verifies the JWT via @clerk/backend verifyToken (caches JWKS internally).
 *   2. Asserts iss === CLERK_ISSUER.
 *   3. JIT-upserts the local `users` row keyed by clerk_user_id.
 *   4. Populates CurrentUserService with { clerkUserId, userId }.
 *
 * Fail-closed guarantees:
 *   - Missing env at boot → env.ts throws before the app starts (not here).
 *   - Missing/invalid/expired token → throws UnauthorizedException (401).
 *   - Clerk JWKS unreachable → verifyToken rejects → 401 (never hangs the caller).
 *
 * Note on JWKS timeout: @clerk/backend uses a 5-second timeout on JWKS fetches
 * by default. If Clerk is unreachable, the rejected promise propagates as a
 * non-HttpException, which AllExceptionsFilter maps to 500. This is intentional
 * fail-closed behaviour — do not swallow or ignore Clerk errors.
 */
@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly logger = new Logger(ClerkAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly currentUser: CurrentUserService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check @Public() metadata on the handler or controller class.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    let payload: Awaited<ReturnType<typeof verifyToken>>;
    try {
      payload = await verifyToken(token, {
        secretKey: CLERK_SECRET_KEY,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Additional issuer assertion — defence-in-depth beyond what @clerk/backend checks.
    if (payload.iss !== CLERK_ISSUER) {
      this.logger.warn(`Token issuer mismatch: expected ${CLERK_ISSUER}, got ${payload.iss}`);
      throw new UnauthorizedException('Invalid token issuer');
    }

    const clerkUserId = payload.sub;

    // JIT provision: upsert the local users row on first authenticated request.
    // The upsert is idempotent — subsequent requests reuse the existing row.
    const user = await this.prisma.users.upsert({
      where: { clerk_user_id: clerkUserId },
      create: {
        clerk_user_id: clerkUserId,
        // email comes from the token's email claim when present (not always set
        // for OAuth-only sign-ups; nullable in schema).
        email: (payload as Record<string, unknown>).email as string | undefined,
      },
      update: {},
      select: { id: true },
    });

    // Attach resolved identity to the request-scoped CurrentUserService.
    this.currentUser.set({ clerkUserId, userId: user.id });

    return true;
  }

  private extractBearerToken(request: Request): string | null {
    const auth = request.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return null;
    const token = auth.slice(7).trim();
    return token.length > 0 ? token : null;
  }
}
