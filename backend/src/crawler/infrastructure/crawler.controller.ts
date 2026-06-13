import { Controller, Get, Inject, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CRAWLER_SERVICE } from '../../common/tokens.js';
import { SUPERS } from '../../config/supers.js';
import type { CrawlerService } from './crawler.service.js';

@Controller('api/sync')
export class CrawlerController {
  constructor(@Inject(CRAWLER_SERVICE) private readonly service: CrawlerService) {}

  // GET /status — returns ARRAY (critical regression guard vs the old {} bug)
  @Get('status')
  async getStatus() {
    return this.service.getSyncStatus();
  }

  // POST /all — fire-and-forget all supers; 409 if any running
  // MUST be declared above @Post(':super') so the literal path wins
  @Post('all')
  syncAll(@Res() res: Response): void {
    const busy = Object.keys(SUPERS).some((key) => this.service.isRunning(key));
    if (busy) {
      res.status(409).json({ error: 'Sync ya en curso' });
      return;
    }

    res.json({ ok: true, message: 'Sync de todos los supers iniciado' });

    this.service
      .syncAll()
      .catch((err: Error) => console.error('Sync all failed:', err.message));
  }

  // POST /:super — fire-and-forget single super
  @Post(':super')
  syncOne(@Param('super') key: string, @Res() res: Response): void {
    if (this.service.isRunning(key)) {
      res.status(409).json({ error: 'Sync ya en curso' });
      return;
    }

    res.json({ ok: true, message: `Sync de ${key} iniciado` });

    this.service
      .syncSuper(key)
      .catch((err: Error) => console.error(`Sync ${key} failed:`, err.message));
  }
}
