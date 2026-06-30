import { Controller, Get, Inject, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ENRICH_SERVICE } from '../../common/tokens.js';
import { Public } from '../../common/auth/public.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { EnrichService } from './enricher.service.js';

@Controller('api/enrich')
export class EnrichmentController {
  constructor(
    @Inject(ENRICH_SERVICE) private readonly enricher: EnrichService,
    private readonly prisma: PrismaService,
  ) {}

  // GET /status — returns all super statuses (in-memory object)
  @Public()
  @Get('status')
  getStatus() {
    return this.enricher.getStatus();
  }

  // POST /:super — fire-and-forget enrich for one super, 409 guard
  // Declared before POST / so Nest uses the param route for non-empty paths
  @Post(':super')
  enrichOne(@Param('super') key: string, @Res() res: Response): void {
    if (this.enricher.isRunning(key)) {
      res.status(409).json({ error: 'Enrichment ya en curso' });
      return;
    }

    res.status(200).json({ ok: true, message: `Enriquecimiento de ${key} iniciado` });

    this.enricher
      .enrichSuper(key)
      .catch((err: Error) => console.error(`Enrich ${key} failed:`, err.message));
  }

  // POST / — hybrid: await findMany → respond → fire background enrichment
  @Post()
  enrichAll(@Res() res: Response): void {
    this.prisma.products
      .findMany({ distinct: ['super'], select: { super: true } })
      .then((rows) => {
        const keys = rows.map((r) => r.super);
        res.status(200).json({
          ok: true,
          message: 'Enriquecimiento de todos los supers iniciado',
          supers: keys,
        });
        for (const key of keys) {
          if (!this.enricher.isRunning(key)) {
            this.enricher
              .enrichSuper(key)
              .catch((err: Error) => console.error(`Enrich ${key} failed:`, err.message));
          }
        }
      })
      .catch((err: Error) => {
        res.status(500).json({ error: err.message });
      });
  }
}
