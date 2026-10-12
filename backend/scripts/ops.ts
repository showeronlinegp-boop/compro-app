/**
 * ops.ts — Manual operations CLI (Decision 5: remove operational HTTP triggers).
 *
 * Replaces the now-deleted POST /api/sync/*, POST /api/enrich/*, and
 * POST /api/promos/capture/* HTTP endpoints. Boots a minimal Nest application
 * context, resolves the target service, runs the operation, and exits.
 *
 * Usage:
 *   npm run ops -- sync [<super>|all]      # crawl one super or all
 *   npm run ops -- enrich [<super>|all]    # enrich one super or all
 *   npm run ops -- promos [<super>|all]    # capture bank promos
 *
 * When <super> is omitted, defaults to "all".
 *
 * DATABASE_URL is required (loaded from backend/.env via dotenv).
 */

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module.js';
import { CRAWLER_SERVICE, ENRICH_SERVICE, PROMO_CAPTURE_SERVICE } from '../src/common/tokens.js';
import type { CrawlerService } from '../src/crawler/infrastructure/crawler.service.js';
import type { EnrichService } from '../src/enrichment/infrastructure/enricher.service.js';
import type { PromoCaptureService } from '../src/modules/promos/infrastructure/promo-capture.service.js';
import { SUPERS } from '../src/config/supers.js';

const VALID_SUPERS = Object.keys(SUPERS);
const OPS = ['sync', 'enrich', 'promos'] as const;
type Op = (typeof OPS)[number];

function usage(): never {
  console.error('Usage: npm run ops -- <sync|enrich|promos> [<super>|all]');
  console.error(`  <super> : one of ${VALID_SUPERS.join(', ')} (default: all)`);
  process.exit(1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const op = args[0] as Op | undefined;
  const target = args[1] ?? 'all';

  if (!op || !OPS.includes(op)) {
    console.error(`Unknown operation: "${op ?? '(none)'}"`);
    usage();
  }

  if (target !== 'all' && !VALID_SUPERS.includes(target)) {
    console.error(`Unknown super: "${target}"`);
    usage();
  }

  const keys = target === 'all' ? VALID_SUPERS : [target];

  // Boot Nest application context (no HTTP server).
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });

  try {
    if (op === 'sync') {
      const crawler = app.get<CrawlerService>(CRAWLER_SERVICE);
      for (const key of keys) {
        console.log(`[ops:sync:${key}] starting…`);
        const result = await crawler.syncSuper(key);
        console.log(`[ops:sync:${key}] done — ${result.count} products`);
      }
    } else if (op === 'enrich') {
      const enricher = app.get<EnrichService>(ENRICH_SERVICE);
      for (const key of keys) {
        console.log(`[ops:enrich:${key}] starting…`);
        await enricher.enrichSuper(key);
        const st = enricher.getStatus()[key];
        if (st) {
          console.log(`[ops:enrich:${key}] done — ${st.updated}/${st.total} products got promo price`);
        }
      }
    } else if (op === 'promos') {
      const promos = app.get<PromoCaptureService>(PROMO_CAPTURE_SERVICE);
      if (target === 'all') {
        console.log('[ops:promos] capturing all supers…');
        await promos.captureAll();
        console.log('[ops:promos] done');
      } else {
        console.log(`[ops:promos:${target}] starting…`);
        await promos.captureSuper(target);
        console.log(`[ops:promos:${target}] done`);
      }
    }
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  console.error('[ops] Fatal error:', err);
  process.exit(1);
});
