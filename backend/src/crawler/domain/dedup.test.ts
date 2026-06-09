/**
 * dedup.test.ts — Characterization test (Task 4.9 baseline, Task 5.9 re-pointed to TS)
 *
 * Now tests the TS port: mergeItems() from crawler/domain/dedup.ts,
 * driven by a crawlPartition-equivalent loop using searchPage() from is-client.ts
 * and buildNormalizer() from normalizer.ts.
 *
 * The snapshots were generated from the LEGACY JS and MUST match byte-identical.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CRAWLER_IS_SAFE_MAX,
  CRAWLER_PAGE_SIZE,
  CRAWLER_THROTTLE_MS,
} from '../../config/throttles.js';
import { searchPage } from '../../infrastructure/vtex/is-client.js';
import { buildNormalizer } from '../../infrastructure/vtex/normalizer.js';
import type { NormalizedCrawlItem, Partition } from '../../shared/types.js';
import { mergeItems } from './dedup.js';

const veaCfg = { baseUrl: 'https://www.vea.com.ar', promoSeller: 'jumboargentinav700cordoba700' };

// ── Replicate crawlPartition() using TS modules ───────────────────────────────
// Mirrors vtex-crawler.js:crawlPartition() exactly, using TS searchPage + mergeItems.

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function crawlPartition(
  cfg: { baseUrl: string; promoSeller?: string },
  partition: Partition,
  seen: Map<string, NormalizedCrawlItem>,
  normalize: (p: unknown) => NormalizedCrawlItem | null,
): Promise<{ fetched: number; total: number; touchedIds: Set<string> }> {
  const pages = Math.ceil(Math.min(partition.total, CRAWLER_IS_SAFE_MAX) / CRAWLER_PAGE_SIZE);
  let fetched = 0;
  const touchedIds = new Set<string>();

  console.log(`  -> crawl: "${partition.name}" (~${partition.total} prods, ${pages} pages)`);

  for (let page = 1; page <= pages; page++) {
    let result: { products: unknown[]; total: number };
    try {
      result = await searchPage(cfg, partition.path, page);
    } catch (err) {
      console.error(`  ⚠  ${partition.name} page ${page}:`, (err as Error).message);
      break;
    }

    if (!result.products.length) break;

    const normalized: NormalizedCrawlItem[] = [];
    for (const p of result.products) {
      fetched++;
      if (fetched === 1) {
        console.log(`  [raw-json] ${(p as { productName: string }).productName}:`);
        console.log(JSON.stringify(p, null, 2));
      }
      const norm = normalize(p);
      if (!norm) continue;
      normalized.push(norm);
    }

    mergeItems(normalized, seen, touchedIds, partition);

    if (result.products.length < CRAWLER_PAGE_SIZE) break;
    await sleep(CRAWLER_THROTTLE_MS);
  }

  return { fetched, total: partition.total, touchedIds };
}

// ── Minimal product factory ───────────────────────────────────────────────────

function makeProduct(productId: string, name: string, categories: string[], price = 1000): object {
  return {
    productId,
    productName: name,
    productReference: null,
    linkText: `product-${productId}`,
    link: `/product-${productId}/p`,
    categories,
    items: [
      {
        itemId: `${productId}1`,
        ean: `EAN${productId}`,
        images: [{ imageUrl: `https://example.com/${productId}.jpg` }],
        sellers: [
          {
            commertialOffer: {
              Price: price,
              ListPrice: price,
              PriceWithoutDiscount: price,
              AvailableQuantity: 5,
            },
          },
        ],
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('TS crawlPartition (mergeItems) — characterization (must match LEGACY snapshots)', () => {
  let originalFetch: typeof globalThis.fetch;
  let originalSetTimeout: typeof globalThis.setTimeout;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalSetTimeout = globalThis.setTimeout;
    // biome-ignore lint/suspicious/noExplicitAny: intentional timer patch
    (globalThis as any).setTimeout = (fn: () => void) => {
      fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    vi.restoreAllMocks();
  });

  it('deduplicates overlapping productIds across pages — snapshot seen Map', async () => {
    const page1 = [
      makeProduct('A', 'Product A', ['/Almacén/Aceites/', '/Almacén/']),
      makeProduct('B', 'Product B', ['/Bebidas/Aguas/']),
      makeProduct('C', 'Product C', ['/Lácteos/']),
    ];
    const page1Padded = [
      ...page1,
      ...Array.from({ length: 47 }, (_, i) =>
        makeProduct(`PAD${i}`, `Padding ${i}`, ['/Padding/']),
      ),
    ];
    const page2 = [
      makeProduct('B', 'Product B', ['/Bebidas/Gaseosas/']),
      makeProduct('D', 'Product D', ['/Carnes/']),
    ];

    let pageCall = 0;
    const stubFetch = vi.fn(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes('/product_search/')) {
        pageCall++;
        if (pageCall === 1) {
          return { ok: true, json: async () => ({ recordsFiltered: 52, products: page1Padded }) };
        }
        if (pageCall === 2) {
          return { ok: true, json: async () => ({ recordsFiltered: 52, products: page2 }) };
        }
        return { ok: true, json: async () => ({ recordsFiltered: 52, products: [] }) };
      }
      throw new Error(`Unexpected fetch: ${urlStr}`);
    });

    // biome-ignore lint/suspicious/noExplicitAny: intentional global stub
    (globalThis as any).fetch = stubFetch;

    const seen = new Map<string, NormalizedCrawlItem>();
    const normalize = buildNormalizer(veaCfg) as (p: unknown) => NormalizedCrawlItem | null;
    const partition: Partition = { path: 'category-1/Almacén', name: 'Almacén', total: 100 };

    const { fetched, touchedIds } = await crawlPartition(veaCfg, partition, seen, normalize);

    expect(seen.size).toBe(51);
    expect(seen.has('A')).toBe(true);
    expect(seen.has('B')).toBe(true);
    expect(seen.has('C')).toBe(true);
    expect(seen.has('D')).toBe(true);

    const productB = seen.get('B') as { category_paths: string[] };
    expect(productB.category_paths).toContain('Bebidas > Aguas');
    expect(productB.category_paths).toContain('Bebidas > Gaseosas');

    expect(touchedIds.has('A')).toBe(true);
    expect(touchedIds.has('B')).toBe(true);
    expect(touchedIds.has('C')).toBe(true);
    expect(touchedIds.has('D')).toBe(true);
    expect(fetched).toBe(52);

    expect([...seen.entries()].map(([k, v]) => ({ id: k, item: v }))).toMatchSnapshot();
  }, 30_000);

  it('stops early when products.length < PAGE_SIZE (50)', async () => {
    const shortPage = [
      makeProduct('X', 'Product X', ['/Almacén/']),
      makeProduct('Y', 'Product Y', ['/Bebidas/']),
    ];

    const stubFetch = vi.fn(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes('/product_search/')) {
        return { ok: true, json: async () => ({ recordsFiltered: 2, products: shortPage }) };
      }
      throw new Error(`Unexpected: ${urlStr}`);
    });

    // biome-ignore lint/suspicious/noExplicitAny: intentional global stub
    (globalThis as any).fetch = stubFetch;

    const seen = new Map<string, NormalizedCrawlItem>();
    const normalize = buildNormalizer(veaCfg) as (p: unknown) => NormalizedCrawlItem | null;
    const partition: Partition = { path: 'category-1/Almacén', name: 'Almacén', total: 2 };

    await crawlPartition(veaCfg, partition, seen, normalize);

    expect(stubFetch).toHaveBeenCalledTimes(1);
    expect(seen.size).toBe(2);
  }, 30_000);

  it('maxPages is capped at ceil(min(total, IS_SAFE_MAX) / PAGE_SIZE)', async () => {
    let pagesCalled = 0;
    const stubFetch = vi.fn(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes('/product_search/')) {
        pagesCalled++;
        const products = Array.from({ length: 50 }, (_, i) =>
          makeProduct(`p${pagesCalled}_${i}`, `Prod ${pagesCalled}_${i}`, ['/Cat/']),
        );
        return { ok: true, json: async () => ({ recordsFiltered: 3000, products }) };
      }
      throw new Error(`Unexpected: ${urlStr}`);
    });

    // biome-ignore lint/suspicious/noExplicitAny: intentional global stub
    (globalThis as any).fetch = stubFetch;

    const seen = new Map<string, NormalizedCrawlItem>();
    const normalize = buildNormalizer(veaCfg) as (p: unknown) => NormalizedCrawlItem | null;
    const partition: Partition = { path: 'category-1/Almacén', name: 'Almacén', total: 3000 };

    await crawlPartition(veaCfg, partition, seen, normalize);

    expect(pagesCalled).toBe(49);
  }, 60_000);

  it('assigns partition.name as fallback category when category_paths is empty (snapshot)', async () => {
    const noCatProduct = {
      productId: 'NC1',
      productName: 'No Category Product',
      productReference: null,
      linkText: 'no-cat',
      link: '/no-cat/p',
      categories: [],
      items: [
        {
          itemId: 'NC11',
          ean: 'EAN_NC1',
          images: [],
          sellers: [
            {
              commertialOffer: {
                Price: 500,
                ListPrice: 500,
                PriceWithoutDiscount: 500,
                AvailableQuantity: 1,
              },
            },
          ],
        },
      ],
    };

    const stubFetch = vi.fn(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes('/product_search/')) {
        return { ok: true, json: async () => ({ recordsFiltered: 1, products: [noCatProduct] }) };
      }
      throw new Error(`Unexpected: ${urlStr}`);
    });

    // biome-ignore lint/suspicious/noExplicitAny: intentional global stub
    (globalThis as any).fetch = stubFetch;

    const seen = new Map<string, NormalizedCrawlItem>();
    const normalize = buildNormalizer(veaCfg) as (p: unknown) => NormalizedCrawlItem | null;
    const partition: Partition = { path: 'category-1/Almacén', name: 'Almacén', total: 1 };

    await crawlPartition(veaCfg, partition, seen, normalize);

    const item = seen.get('NC1') as { category_paths: string[] };
    expect(item.category_paths).toEqual(['Almacén']);
    expect(item).toMatchSnapshot();
  }, 30_000);
});
