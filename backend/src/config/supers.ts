import type { CrawlConcurrency, SuperConfig, SuperKey } from '../shared/types.js';
import {
  ENV_CRAWLER_PAGE_CONC,
  ENV_CRAWLER_PARTITION_CONC,
  ENV_CRAWLER_PROBE_CONC,
  ENV_CRAWLER_THROTTLE_MS,
} from './env.js';

export const SUPERS: Record<SuperKey, SuperConfig> = {
  // VEA: ListPrice is stale garbage (e.g. 528017 vs Price 6389) → trustListPrice OFF.
  // Real discounts come from the search-promotions enricher (promoSeller set).
  vea: { baseUrl: 'https://www.vea.com.ar', promoSeller: 'jumboargentinav700cordoba700' },
  masonline: { baseUrl: 'https://www.masonline.com.ar', trustListPrice: true },
  // Carrefour renders JSON-LD client-side: data_found=0/18303 in production runs.
  // Discounts come from the IS-API crawl. PriceWithoutDiscount === Price for discounted
  // items; the real strike-through lives in ListPrice → trustListPrice ON.
  carrefour: { baseUrl: 'https://www.carrefour.com.ar', enrichStrategy: 'none', trustListPrice: true },
  // DIA: discounts live in ListPrice (PWD === Price for discounted items) → trustListPrice ON.
  dia: { baseUrl: 'https://diaonline.supermercadosdia.com.ar', trustListPrice: true },
};

/**
 * Resolve the effective CrawlConcurrency for a given super.
 *
 * Precedence (highest wins): per-super override > env vars > static defaults.
 * Never throws — missing or invalid values always fall back gracefully.
 */
export function resolveCrawlConfig(superKey: string): CrawlConcurrency {
  const perSuper = SUPERS[superKey as SuperKey]?.crawl ?? {};

  return {
    probeConc: perSuper.probeConc ?? ENV_CRAWLER_PROBE_CONC,
    pageConc: perSuper.pageConc ?? ENV_CRAWLER_PAGE_CONC,
    partitionConc: perSuper.partitionConc ?? ENV_CRAWLER_PARTITION_CONC,
    throttleMs: perSuper.throttleMs ?? ENV_CRAWLER_THROTTLE_MS,
  };
}

/**
 * Resolve the enrichment strategy for a given super.
 *
 * Precedence: explicit enrichStrategy config > derived from promoSeller.
 * - Explicit 'none'        → skip enrichment (e.g. Carrefour: client-side JSON-LD, crawl has discounts).
 * - Explicit 'promotions'  → use search-promotions endpoint.
 * - Explicit 'jsonld'      → use HTML JSON-LD scraping.
 * - Unset + promoSeller    → 'promotions' (e.g. vea).
 * - Unset + no promoSeller → 'jsonld' (e.g. dia, masonline).
 */
export function resolveEnrichStrategy(superKey: string): 'promotions' | 'jsonld' | 'none' {
  const cfg = SUPERS[superKey as SuperKey];
  if (cfg?.enrichStrategy != null) return cfg.enrichStrategy;
  return cfg?.promoSeller ? 'promotions' : 'jsonld';
}
