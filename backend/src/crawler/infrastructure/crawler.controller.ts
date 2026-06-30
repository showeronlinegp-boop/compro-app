import { Controller, Get, Inject, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CRAWLER_SERVICE, PROFILE_REPO } from '../../common/tokens.js';
import { Public } from '../../common/auth/public.decorator.js';
import { SUPERS } from '../../config/supers.js';
import type { ProfileRepo } from '../../modules/profile/infrastructure/profile.repo.js';
import type { RegionIds } from '../../shared/types.js';
import type { CrawlerService } from './crawler.service.js';

@Controller('api/sync')
export class CrawlerController {
  constructor(
    @Inject(CRAWLER_SERVICE) private readonly service: CrawlerService,
    @Inject(PROFILE_REPO) private readonly profiles: ProfileRepo,
  ) {}

  /**
   * Resolve the user's saved region map, or null if no location is set.
   * The sync (a test-only manual trigger) requires a location so it crawls the
   * user's region instead of pulling every region's prices.
   */
  private async requireRegionIds(): Promise<RegionIds | null> {
    const profile = await this.profiles.get();
    if (!profile?.postal_code) return null;
    return profile.region_ids ?? {};
  }

  // GET /status — returns ARRAY (critical regression guard vs the old {} bug)
  @Public()
  @Get('status')
  async getStatus() {
    return this.service.getSyncStatus();
  }

  // POST /all — fire-and-forget all supers; 409 if any running
  // MUST be declared above @Post(':super') so the literal path wins
  @Post('all')
  async syncAll(@Res() res: Response): Promise<void> {
    const regionIds = await this.requireRegionIds();
    if (!regionIds) {
      res.status(409).json({ error: 'Cargá tu ubicación antes de sincronizar' });
      return;
    }

    const busy = Object.keys(SUPERS).some((key) => this.service.isRunning(key));
    if (busy) {
      res.status(409).json({ error: 'Sync ya en curso' });
      return;
    }

    res.status(200).json({ ok: true, message: 'Sync de todos los supers iniciado' });

    this.service
      .syncAll(regionIds as Record<string, string | null>)
      .catch((err: Error) => console.error('Sync all failed:', err.message));
  }

  // POST /:super — fire-and-forget single super
  @Post(':super')
  async syncOne(@Param('super') key: string, @Res() res: Response): Promise<void> {
    const regionIds = await this.requireRegionIds();
    if (!regionIds) {
      res.status(409).json({ error: 'Cargá tu ubicación antes de sincronizar' });
      return;
    }

    if (this.service.isRunning(key)) {
      res.status(409).json({ error: 'Sync ya en curso' });
      return;
    }

    res.status(200).json({ ok: true, message: `Sync de ${key} iniciado` });

    this.service
      .syncSuper(key, regionIds[key as keyof RegionIds] ?? null)
      .catch((err: Error) => console.error(`Sync ${key} failed:`, err.message));
  }
}
