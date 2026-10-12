import { SetMetadata } from '@nestjs/common';

/**
 * Mark a controller or route handler as publicly accessible — no Clerk JWT
 * required. The ClerkAuthGuard reads this metadata via Reflector and skips
 * token verification when present.
 *
 * Usage:
 *   @Public()            — on a controller class: all routes are public
 *   @Public()            — on a route handler: that single route is public
 */
export const IS_PUBLIC_KEY = 'IS_PUBLIC';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
