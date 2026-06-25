import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CrawlerModule } from './crawler/infrastructure/crawler.module.js';
import { EnrichmentModule } from './enrichment/infrastructure/enrichment.module.js';
import { CartModule } from './modules/cart/infrastructure/cart.module.js';
import { CatalogModule } from './modules/catalog/infrastructure/catalog.module.js';
import { CompareModule } from './modules/compare/infrastructure/compare.module.js';
import { InterestsModule } from './modules/interests/infrastructure/interests.module.js';
import { ProfileModule } from './modules/profile/infrastructure/profile.module.js';
import { PromosModule } from './modules/promos/infrastructure/promos.module.js';
import { ShoppingModule } from './modules/shopping/infrastructure/shopping.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SchedulerModule } from './scheduler/scheduler.module.js';

@Module({
  imports: [
    PrismaModule,
    ScheduleModule.forRoot(),
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
  ],
})
export class AppModule {}
