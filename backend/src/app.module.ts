import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './common/auth/auth.module.js';
import { ENABLE_COMPARADOR } from './config/env.js';
import { CrawlerModule } from './crawler/infrastructure/crawler.module.js';
import { EnrichmentModule } from './enrichment/infrastructure/enrichment.module.js';
import { HealthModule } from './health/health.module.js';
import { CartModule } from './modules/cart/infrastructure/cart.module.js';
import { CatalogModule } from './modules/catalog/infrastructure/catalog.module.js';
import { CompareModule } from './modules/compare/infrastructure/compare.module.js';
import { FiadoModule } from './modules/fiado/infrastructure/fiado.module.js';
import { InterestsModule } from './modules/interests/infrastructure/interests.module.js';
import { ProfileModule } from './modules/profile/infrastructure/profile.module.js';
import { PromosModule } from './modules/promos/infrastructure/promos.module.js';
import { ShoppingModule } from './modules/shopping/infrastructure/shopping.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SchedulerModule } from './scheduler/scheduler.module.js';

/**
 * Compras: comparador de supermercados, crawler, enricher y crons de sync.
 * Sólo se montan con ENABLE_COMPARADOR=true (ver config/env.ts).
 */
export const COMPARADOR_MODULES = [
  CatalogModule,
  InterestsModule,
  ShoppingModule,
  CartModule,
  PromosModule,
  ProfileModule,
  CompareModule,
  EnrichmentModule,
  CrawlerModule,
  SchedulerModule,
];

/** Imports del AppModule; exportado para testear el arranque sin compras. */
export function appImports(comparador: boolean) {
  return [
    // Global rate-limiting: 100 requests per 60 s per IP.
    // Heavy-read endpoints override this with a stricter @Throttle() decorator.
    ThrottlerModule.forRoot([{ name: 'global', ttl: 60_000, limit: 100 }]),
    PrismaModule,
    // AuthModule must come before feature modules so APP_GUARD is registered first.
    AuthModule,
    ScheduleModule.forRoot(),
    HealthModule,
    FiadoModule,
    ...(comparador ? COMPARADOR_MODULES : []),
  ];
}

@Module({
  imports: appImports(ENABLE_COMPARADOR),
  providers: [
    // ThrottlerGuard registered as APP_GUARD alongside ClerkAuthGuard (in AuthModule).
    // Both guards run; order within APP_GUARD array follows registration order.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
