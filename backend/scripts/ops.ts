/**
 * ops.ts — Manual operations CLI (Decision 5: remove operational HTTP triggers).
 *
 * Replaces the now-deleted POST /api/sync/*, POST /api/enrich/*, and
 * POST /api/promos/capture/* HTTP endpoints. Boots a minimal Nest application
 * context, resolves the target service, runs the operation, and exits.
 *
 * Usage:
 *   npm run ops -- sync [<super>|all] [--cp <postal>]   # crawl one super or all
 *   npm run ops -- enrich [<super>|all]                 # enrich one super or all
 *   npm run ops -- promos [<super>|all]                 # capture bank promos
 *
 * When <super> is omitted, defaults to "all".
 *
 * --cp <postal> (sync only): resolve that postal code to each super's regionId
 * and crawl THAT zone's prices/stock. Without it, sync uses the default region
 * (CABA for VEA). NOTE: products is single-region storage today, so a zoned
 * sync REPLACES the previously crawled region — you hold one zone at a time.
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
import { geocodePostalCode } from '../src/infrastructure/geocode.js';
import { resolveRegionForGeo } from '../src/infrastructure/vtex/resolve-region.js';
import type { RegionIds, SuperKey } from '../src/shared/types.js';

const VALID_SUPERS = Object.keys(SUPERS);
const OPS = ['sync', 'enrich', 'promos'] as const;
type Op = (typeof OPS)[number];

function usage(): never {
  console.error('Usage: npm run ops -- <sync|enrich|promos> [<super>|all] [--cp <postal>]');
  console.error(`  <super> : one of ${VALID_SUPERS.join(', ')} (default: all)`);
  console.error('  --cp <postal> : (sync only) crawl the zone for that postal code');
  process.exit(1);
}

async function main(): Promise<void> {
  const raw = process.argv.slice(2);

  // Extract the optional --cp <postal> flag; everything else is positional.
  let cp: string | undefined;
  const positional: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i];
    if (arg === undefined) continue;
    if (arg === '--cp') {
      cp = raw[++i];
    } else if (arg.startsWith('--cp=')) {
      cp = arg.slice('--cp='.length);
    } else {
      positional.push(arg);
    }
  }

  const op = positional[0] as Op | undefined;
  const target = positional[1] ?? 'all';

  if (!op || !OPS.includes(op)) {
    console.error(`Unknown operation: "${op ?? '(none)'}"`);
    usage();
  }

  if (target !== 'all' && !VALID_SUPERS.includes(target)) {
    console.error(`Unknown super: "${target}"`);
    usage();
  }

  const keys = target === 'all' ? VALID_SUPERS : [target];

  // Resolve per-super regionIds from a postal code when --cp is given (sync only).
  let regionIds: RegionIds | null = null;
  if (cp) {
    if (op !== 'sync') {
      console.error('--cp is only supported for the "sync" operation');
      usage();
    }
    const digits = cp.replace(/\D/g, '').slice(0, 4);
    if (digits.length < 4) {
      console.error(`Invalid postal code: "${cp}" (need at least 4 digits)`);
      usage();
    }
    console.log(`[ops] Resolving zone for postal code ${digits}…`);
    const geo = await geocodePostalCode(digits);
    if (!geo) {
      console.error(`[ops] Could not locate postal code ${digits}`);
      process.exit(1);
    }
    const resolved = await resolveRegionForGeo(geo);
    regionIds = resolved.regionIds;
    console.log('[ops] Resolved regionIds:', regionIds);
  }

  // Boot Nest application context (no HTTP server).
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });

  try {
    if (op === 'sync') {
      const crawler = app.get<CrawlerService>(CRAWLER_SERVICE);
      for (const key of keys) {
        const regionId = regionIds ? (regionIds[key as SuperKey] ?? null) : null;
        console.log(`[ops:sync:${key}] starting…${regionId ? ' [zoned]' : ''}`);
        const result = await crawler.syncSuper(key, regionId);
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
