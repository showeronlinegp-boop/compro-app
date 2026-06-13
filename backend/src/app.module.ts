import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module.js';
import { CatalogModule } from './modules/catalog/infrastructure/catalog.module.js';

@Module({
  imports: [
    PrismaModule,
    ScheduleModule.forRoot(),
    CatalogModule,
    // Remaining feature modules wired in Slice 2:
    // InterestsModule, ShoppingModule, PromosModule,
    // EnrichmentModule, CrawlerModule, SchedulerModule
  ],
})
export class AppModule {}
