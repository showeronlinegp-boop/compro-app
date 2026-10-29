import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ADMIN_IDS } from '../tokens.js';
import type { RequestWithAuth } from './current-user.service.js';

/** ¿`clerkUserId` está en la lista de admins? Lista vacía = nadie. */
export function esAdmin(clerkUserId: string | undefined, admins: readonly string[]): boolean {
  return !!clerkUserId && admins.includes(clerkUserId);
}

/**
 * Sólo deja pasar a los Clerk user IDs de ADMIN_CLERK_USER_IDS. Corre DESPUÉS
 * del ClerkAuthGuard global (que ya validó el token y llenó request.auth), así
 * que sin sesión la respuesta sigue siendo 401 y con sesión no-admin, 403.
 *
 * Se usa con `@UseGuards(AdminGuard)` en un módulo que provea ADMIN_IDS.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject(ADMIN_IDS) private readonly admins: readonly string[]) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    if (!esAdmin(request.auth?.clerkUserId, this.admins)) {
      throw new ForbiddenException('Solo para administradores');
    }
    return true;
  }
}
