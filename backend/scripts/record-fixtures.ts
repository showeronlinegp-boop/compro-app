/**
 * record-fixtures.ts — One-shot VTEX fixture recorder.
 *
 * Hits real VTEX endpoints and writes raw response bodies to
 * backend/src/infrastructure/vtex/__fixtures__/
 *
 * Run once with live network, commit the produced files, then never
 * re-run unless VTEX API shapes drift (they are the behavior contract).
 *
 * Usage:
 *   cd backend
 *   npx tsx scripts/record-fixtures.ts
 *
 * Options (env vars, all optional):
 *   SUPERS=vea,carrefour     Comma-separated subset of supers to record (default: all)
 *   SEARCH_PAGES=2           Number of IS product_search pages to record (default: 2)
 *   PROMO_BATCH_SIZE=20      SKU batch size for search-promotions (default: 20)
 *   MAX_VARIATIONS=3         Number of productId variation samples per super (default: 3)
 *   FIXTURES_DIR=<path>      Absolute path to fixtures output dir (default: auto-resolved)
 *
 * Output files:
 *   is-search-<super>-<slug>-p<n>.json    IS product_search pages (first 5 products per page)
 *   catalog-tree-<super>.json             category/tree/2
 *   variations-<super>-<productId>.json   catalog_system/pub/products/variations/:id
 *   promotions-vea.json                   _v/search-promotions POST (vea only)
 *   jsonld-<super>-<productId>.html       product HTML (JSON-LD blocks only; carrefour + dia)
 */

import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SUPERS } from '../src/config/supers.js';
import { ENRICH_PROMO_BATCH, ENRICH_THROTTLE_MS, UA } from '../src/config/throttles.js';

// ---------------------------------------------------------------------------
// Config / CLI
// ---------------------------------------------------------------------------

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FIXTURES_DIR = path.resolve(SCRIPT_DIR, '../src/infrastructure/vtex/__fixtures__');

function parseEnvList(key: string, fallback: string[]): string[] {
  const raw = process.env[key];
  if (!raw) return fallback;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseEnvInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

const ALL_SUPER_KEYS = Object.keys(SUPERS) as Array<keyof typeof SUPERS>;

const ENABLED_SUPERS = parseEnvList('SUPERS', ALL_SUPER_KEYS) as Array<keyof typeof SUPERS>;
const SEARCH_PAGES = parseEnvInt('SEARCH_PAGES', 2);
const PROMO_BATCH_SIZE = parseEnvInt('PROMO_BATCH_SIZE', ENRICH_PROMO_BATCH);
const MAX_VARIATIONS = parseEnvInt('MAX_VARIATIONS', 3);
const FIXTURES_DIR = process.env.FIXTURES_DIR ?? DEFAULT_FIXTURES_DIR;

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

const TIMEOUT_JSON = 20_000;
const TIMEOUT_HTML = 15_000;

const JSON_HEADERS: Record<string, string> = {
  'User-Agent': UA,
  Accept: 'application/json',
};

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { ...JSON_HEADERS, ...((init?.headers as Record<string, string>) ?? {}) },
    signal: AbortSignal.timeout(TIMEOUT_JSON),
    ...init,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json() as Promise<T>;
}

async function getText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(TIMEOUT_HTML),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

// ---------------------------------------------------------------------------
// Write helpers
// ---------------------------------------------------------------------------

async function saveJson(filename: string, data: unknown): Promise<void> {
  const dest = path.join(FIXTURES_DIR, filename);
  await writeFile(dest, JSON.stringify(data, null, 2), 'utf8');
  console.log(`  [saved] ${filename}`);
}

async function saveText(filename: string, text: string): Promise<void> {
  const dest = path.join(FIXTURES_DIR, filename);
  await writeFile(dest, text, 'utf8');
  console.log(`  [saved] ${filename} (${(text.length / 1024).toFixed(1)} KB)`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// VTEX URL builders (exact replicas of vtex-crawler.js / enricher.js)
// ---------------------------------------------------------------------------

const IS_BASE = '/api/io/_v/api/intelligent-search';

function isSearchUrl(baseUrl: string, facetPath: string, page: number): string {
  const encodedPath = facetPath.split('/').map(encodeURIComponent).join('/');
  return (
    `${baseUrl}${IS_BASE}/product_search/${encodedPath}` +
    `?query=&page=${page}&count=50&hideUnavailableItems=true&simulationBehavior=default`
  );
}

function catalogTreeUrl(baseUrl: string, depth = 2): string {
  return `${baseUrl}/api/catalog_system/pub/category/tree/${depth}`;
}

function variationsUrl(baseUrl: string, productId: string): string {
  return `${baseUrl}/api/catalog_system/pub/products/variations/${productId}`;
}

function promoUrl(baseUrl: string): string {
  return `${baseUrl}/_v/search-promotions`;
}

// ---------------------------------------------------------------------------
// Types (minimal shape used for fixture trimming + URL extraction)
// ---------------------------------------------------------------------------

interface IsProduct {
  productId: string;
  productName: string;
  linkText?: string;
  link?: string;
  items?: Array<{
    itemId?: string;
    ean?: string;
    images?: Array<{ imageUrl?: string }>;
    sellers?: Array<{
      commertialOffer?: {
        Price?: number;
        PriceWithoutDiscount?: number;
        AvailableQuantity?: number;
      };
    }>;
  }>;
  categories?: string[];
}

interface IsSearchResponse {
  products: IsProduct[];
  recordsFiltered?: number;
}

interface VariationsResponse {
  skus?: Array<{ sku?: number; skuname?: string }>;
}

// ---------------------------------------------------------------------------
// 1. IS product_search pages
// ---------------------------------------------------------------------------

/**
 * Result of IS search recording for a super — carries both productIds (for
 * variations) and per-product metadata (skuIds, linkTexts) needed by later steps.
 */
interface IsSearchResult {
  /** Unique productIds found (deduplicated, in insertion order) */
  productIds: string[];
  /**
   * First sku_id (items[0].itemId) for each product, keyed by productId.
   * Used to build the search-promotions request — the endpoint requires sku_ids,
   * NOT productIds (sending productIds returns HTTP 500).
   */
  skuIdsByProductId: Map<string, string>;
  /**
   * linkText for each product, keyed by productId.
   * Used to build product-page URLs: {baseUrl}/{linkText}/p
   * Building from productId ({baseUrl}/{productId}/p) returns 404.
   */
  linkTextByProductId: Map<string, string>;
  /** Raw IsProduct objects from the first recorded partition (for HTML step) */
  products: IsProduct[];
}

/**
 * Records SEARCH_PAGES pages of IS product_search for the first non-empty
 * partition found in the catalog tree. Saves is-search-<super>-<slug>-p<n>.json.
 *
 * Returns collected productIds, sku_ids (items[].itemId), and linkTexts.
 */
async function recordIsSearch(superKey: keyof typeof SUPERS): Promise<IsSearchResult> {
  const cfg = SUPERS[superKey];
  console.log(`\n[${superKey}] Recording IS product_search...`);

  const result: IsSearchResult = {
    productIds: [],
    skuIdsByProductId: new Map(),
    linkTextByProductId: new Map(),
    products: [],
  };

  let tree: Array<{ name: string }>;
  try {
    tree = await getJson<Array<{ name: string }>>(catalogTreeUrl(cfg.baseUrl));
  } catch (err) {
    console.error(`  [error] catalog tree for IS search: ${String(err)} — skipping`);
    return result;
  }

  if (!tree.length) {
    console.warn(`  [warn] empty catalog tree for ${superKey}`);
    return result;
  }

  for (const dept of tree.slice(0, 5)) {
    const facetPath = `category-1/${dept.name}`;
    let foundAny = false;

    for (let page = 1; page <= SEARCH_PAGES; page++) {
      const url = isSearchUrl(cfg.baseUrl, facetPath, page);
      try {
        const data = await getJson<IsSearchResponse>(url);
        if (!data.products?.length) break;

        // Trim to first 5 products per page — full shape preserved, just fewer items.
        const trimmed: IsSearchResponse = {
          recordsFiltered: data.recordsFiltered,
          products: data.products.slice(0, 5),
        };

        const slug = facetPath.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-');
        await saveJson(`is-search-${superKey}-${slug}-p${page}.json`, trimmed);

        for (const p of data.products) {
          if (!result.productIds.includes(p.productId)) {
            result.productIds.push(p.productId);

            // Collect sku_id: search-promotions requires items[].itemId (sku_ids),
            // NOT productIds — sending productIds returns HTTP 500.
            const skuId = p.items?.[0]?.itemId;
            if (skuId) result.skuIdsByProductId.set(p.productId, skuId);

            // Collect linkText: product URL must be {baseUrl}/{linkText}/p.
            // Using productId in the URL ({baseUrl}/{productId}/p) returns 404.
            if (p.linkText) result.linkTextByProductId.set(p.productId, p.linkText);
          }
        }

        // Keep raw products from the first page of the first partition for
        // the HTML fixture step (pickProductUrl needs linkText / link).
        if (page === 1 && !result.products.length) {
          result.products = data.products.slice(0, 5);
        }

        foundAny = true;
        await sleep(ENRICH_THROTTLE_MS);
      } catch (err) {
        console.error(`  [error] IS search ${facetPath} p${page}: ${String(err)}`);
        break;
      }
    }

    if (foundAny) break; // one representative partition is enough
  }

  if (!result.productIds.length) {
    console.warn(`  [warn] no products found for ${superKey} — no IS fixtures saved`);
  }

  const skuCount = result.skuIdsByProductId.size;
  const linkCount = result.linkTextByProductId.size;
  console.log(
    `  [info] ${superKey}: ${result.productIds.length} productIds, ${skuCount} sku_ids, ${linkCount} linkTexts`,
  );

  return result;
}

// ---------------------------------------------------------------------------
// 2. Category tree
// ---------------------------------------------------------------------------

async function recordCatalogTree(superKey: keyof typeof SUPERS): Promise<void> {
  const cfg = SUPERS[superKey];
  console.log(`\n[${superKey}] Recording catalog tree...`);
  try {
    const data = await getJson<unknown>(catalogTreeUrl(cfg.baseUrl));
    await saveJson(`catalog-tree-${superKey}.json`, data);
  } catch (err) {
    console.error(`  [error] catalog tree: ${String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// 3. SKU variations
// ---------------------------------------------------------------------------

async function recordVariations(
  superKey: keyof typeof SUPERS,
  productIds: string[],
): Promise<void> {
  const cfg = SUPERS[superKey];
  const targets = productIds.slice(0, MAX_VARIATIONS);

  if (!targets.length) {
    console.warn(`  [warn] no productIds for ${superKey} — skipping variations`);
    return;
  }

  console.log(`\n[${superKey}] Recording SKU variations (${targets.length} products)...`);

  for (const productId of targets) {
    try {
      const url = variationsUrl(cfg.baseUrl, productId);
      const data = await getJson<VariationsResponse>(url);
      await saveJson(`variations-${superKey}-${productId}.json`, data);
      await sleep(ENRICH_THROTTLE_MS);
    } catch (err) {
      console.error(`  [error] variations ${productId}: ${String(err)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 4. search-promotions POST (vea only — needs promoSeller)
//
// IMPORTANT: the endpoint requires sku_ids (items[].itemId), NOT productIds.
// Sending productIds returns HTTP 500. Batch size must not exceed ENRICH_PROMO_BATCH
// (20) — the endpoint's hard limit.
// ---------------------------------------------------------------------------

async function recordPromotions(skuIds: string[]): Promise<void> {
  const cfg = SUPERS.vea;

  if (!cfg.promoSeller) {
    console.warn('[vea] no promoSeller configured — skipping promotions');
    return;
  }

  const batch = skuIds.slice(0, PROMO_BATCH_SIZE);
  if (!batch.length) {
    console.warn('[vea] no skuIds available — skipping promotions');
    return;
  }

  console.log(`\n[vea] Recording search-promotions (${batch.length} SKU IDs)...`);

  try {
    const url = promoUrl(cfg.baseUrl);
    const body = JSON.stringify({ seller: cfg.promoSeller, skus: batch });
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.error(`  [error] search-promotions HTTP ${res.status}`);
      return;
    }

    const data = (await res.json()) as unknown;
    await saveJson('promotions-vea.json', data);
  } catch (err) {
    console.error(`  [error] search-promotions: ${String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// 5. Product-page HTML (JSON-LD) — carrefour + dia
//
// IMPORTANT: product URLs must be built from linkText ({baseUrl}/{linkText}/p).
// Using productId in the URL ({baseUrl}/{productId}/p) returns 404.
// The `link` field from IS is an acceptable fallback if linkText is absent.
// ---------------------------------------------------------------------------

function pickProductUrl(
  superKey: 'carrefour' | 'dia',
  products: IsProduct[],
  linkTextByProductId: Map<string, string>,
): string | null {
  for (const p of products) {
    // Prefer linkText-built URL (authoritative); fall back to IS `link` field.
    const linkText = linkTextByProductId.get(p.productId) ?? p.linkText;
    if (linkText) return `${SUPERS[superKey].baseUrl}/${linkText}/p`;
    if (p.link) return p.link;
  }
  return null;
}

/**
 * Trims HTML to JSON-LD blocks only — avoids megabyte fixtures while keeping
 * every <script type="application/ld+json"> block intact for snapshot testing.
 */
function trimHtml(html: string): string {
  const ldJsonBlocks: string[] = [];
  for (const m of html.matchAll(
    /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    ldJsonBlocks.push(m[0]);
  }

  if (!ldJsonBlocks.length) {
    return `${html.slice(0, 4_000)}\n<!-- [trimmed: no ld+json found] -->`;
  }

  return `<!DOCTYPE html>\n<html><head>\n<!-- fixture trimmed by record-fixtures.ts: ld+json blocks only -->\n${ldJsonBlocks.join('\n')}\n</head><body></body></html>`;
}

async function recordJsonLdHtml(
  superKey: 'carrefour' | 'dia',
  products: IsProduct[],
  linkTextByProductId: Map<string, string>,
): Promise<void> {
  console.log(`\n[${superKey}] Recording product-page HTML (JSON-LD)...`);

  const productUrl = pickProductUrl(superKey, products, linkTextByProductId);
  if (!productUrl) {
    console.warn(`  [warn] no product URL found for ${superKey} — skipping HTML fixture`);
    return;
  }

  console.log(`  [url] ${productUrl}`);
  const productId = products[0]?.productId ?? 'unknown';

  try {
    const html = await getText(productUrl);
    const trimmed = trimHtml(html);
    await saveText(`jsonld-${superKey}-${productId}.html`, trimmed);
  } catch (err) {
    console.error(`  [error] HTML scrape ${productUrl}: ${String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== VTEX Fixture Recorder ===');
  console.log(`Output directory : ${FIXTURES_DIR}`);
  console.log(`Supers           : ${ENABLED_SUPERS.join(', ')}`);
  console.log(`IS pages/super   : ${SEARCH_PAGES}`);
  console.log(`Promo batch size : ${PROMO_BATCH_SIZE}`);
  console.log(`Variations/super : ${MAX_VARIATIONS}`);
  console.log('');
  console.log('NOTE: Fixtures should be committed and treated as the behavior');
  console.log('      contract. Re-record deliberately only if VTEX shapes drift.');
  console.log('');

  await mkdir(FIXTURES_DIR, { recursive: true });

  // IS search results per super — carry productIds, sku_ids, linkTexts, and raw products
  const resultsBySuper: Partial<Record<keyof typeof SUPERS, IsSearchResult>> = {};

  // Steps 1 + 2: IS search + catalog tree per super
  for (const superKey of ENABLED_SUPERS) {
    if (!SUPERS[superKey]) {
      console.warn(`[warn] Unknown super key: ${superKey} — skipping`);
      continue;
    }
    await recordCatalogTree(superKey);
    resultsBySuper[superKey] = await recordIsSearch(superKey);
  }

  // Step 3: SKU variations (uses productIds)
  for (const superKey of ENABLED_SUPERS) {
    if (!SUPERS[superKey]) continue;
    await recordVariations(superKey, resultsBySuper[superKey]?.productIds ?? []);
  }

  // Step 4: search-promotions (vea only, requires sku_ids NOT productIds)
  if (ENABLED_SUPERS.includes('vea')) {
    const veaResult = resultsBySuper.vea;
    const skuIds = veaResult ? [...veaResult.skuIdsByProductId.values()] : [];
    if (skuIds.length) {
      await recordPromotions(skuIds);
    } else {
      console.warn('[vea] No sku_ids collected — promotions fixture skipped');
      console.warn('      (sku_ids come from products[].items[0].itemId in IS search response)');
    }
  }

  // Step 5: JSON-LD HTML (carrefour + dia, uses linkText for product URL)
  for (const superKey of (['carrefour', 'dia'] as const).filter((s) =>
    ENABLED_SUPERS.includes(s),
  )) {
    const superResult = resultsBySuper[superKey];
    if (superResult?.products.length) {
      await recordJsonLdHtml(superKey, superResult.products, superResult.linkTextByProductId);
    } else {
      console.warn(`[${superKey}] No products found — HTML fixture skipped`);
    }
  }

  console.log('\n=== Done ===');
  console.log(`Fixtures written to: ${FIXTURES_DIR}`);
  console.log('');
  console.log('Next step (task 4.2 — human-gated):');
  console.log('  Review the fixture files, then commit them:');
  console.log('    git add backend/src/infrastructure/vtex/__fixtures__/');
  console.log('    git commit -m "test: add VTEX recorded fixtures for characterization tests"');
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
