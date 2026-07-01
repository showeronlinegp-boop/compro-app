import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ClerkAuthGuard } from './clerk-auth.guard.js';
import { CurrentUserService } from './current-user.service.js';

/**
 * AuthModule — global module that wires ClerkAuthGuard as the APP_GUARD
 * and provides CurrentUserService (request-scoped) to every module.
 *
 * PrismaModule is already @Global(), so PrismaService is available here
 * without an explicit import.
 *
 * @Global() ensures CurrentUserService is injectable everywhere without
 * explicit imports.
 */
@Global()
@Module({
  providers: [
    CurrentUserService,
    {
      provide: APP_GUARD,
      useClass: ClerkAuthGuard,
    },
  ],
  exports: [CurrentUserService],
})
export class AuthModule {}
