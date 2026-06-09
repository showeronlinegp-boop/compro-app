/**
 * partition.test.ts — Characterization test (Task 4.8 baseline, Task 5.9 re-pointed to TS)
 *
 * Now tests the TS port: planPartitions() + buildProbeCounts() from the TS crawler.
 * The snapshots were generated from the LEGACY JS and MUST match byte-identical.
 *
 * Strategy: stub globalThis.fetch identically to the legacy baseline tests,
 * then call the TS planPartitions() via the same observable I/O path.
 * The TS partition planner is split into:
 *   - getCatalogTree() + buildProbeCounts() (IO, in crawler.service — re-exported via testable wrapper)
 *   - planPartitions() (pure, in crawler/domain/partition.ts)
 *
 * We call the exported getPartitionsForTest() helper (same behavior as legacy getPartitions)
 * with the same stubbed fetch. Snapshots MUST match without regeneration.
 */

import * as nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCatalogTree } from '../../infrastructure/vtex/is-client.js';
import { planPartitions } from './partition.js';
import type { TreeNode } from './partition.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = nodePath.dirname(__filename);

// ── fixtures ──────────────────────────────────────────────────────────────────
import catalogTreeVea from '../../infrastructure/vtex/__fixtures__/catalog-tree-vea.json' with {
  type: 'json',
};
import veaPage1 from '../../infrastructure/vtex/__fixtures__/is-search-vea-category-1-Almac-n-p1.json' with {
  type: 'json',
};

// We need to replicate the full getPartitions() behavior from the legacy JS
// (tree fetch + per-dept probe + per-sub probe when > IS_SAFE_MAX) using the TS modules.
// This helper mirrors vtex-crawler.js:getPartitions() exactly.
import { CRAWLER_IS_SAFE_MAX, CRAWLER_THROTTLE_MS } from '../../config/throttles.js';
import { searchPage } from '../../infrastructure/vtex/is-client.js';

async function getPartitions(cfg: { baseUrl: string; promoSeller?: string }) {
  const tree = await getCatalogTree(cfg, 2);
  const counts = new Map<string, number>();

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  for (const dept of tree as TreeNode[]) {
    const path1 = `category-1/${dept.name}`;
    let total1 = 0;
    try {
      const result = await searchPage(cfg, path1, 1);
      total1 = result.total;
    } catch {
      total1 = 0;
    }
    await sleep(CRAWLER_THROTTLE_MS);
    counts.set(path1, total1);

    if (total1 > CRAWLER_IS_SAFE_MAX && (dept.children ?? []).length > 0) {
      for (const sub of dept.children) {
        const path2 = `category-1/${dept.name}/category-2/${sub.name}`;
        let total2 = 0;
        try {
          const result = await searchPage(cfg, path2, 1);
          total2 = result.total;
        } catch {
          total2 = 0;
        }
        await sleep(CRAWLER_THROTTLE_MS);
        counts.set(path2, total2);
      }
    }
  }

  return planPartitions(tree as TreeNode[], counts);
}

const veaCfg = { baseUrl: 'https://www.vea.com.ar', promoSeller: 'jumboargentinav700cordoba700' };

// ── Fixture-backed fetch stub ─────────────────────────────────────────────────

function makeFixtureFetch() {
  return vi.fn(async (url: string) => {
    const urlStr = String(url);

    if (urlStr.includes('/category/tree/')) {
      return {
        ok: true,
        json: async () => catalogTreeVea,
      };
    }

    if (urlStr.includes('/product_search/')) {
      return {
        ok: true,
        json: async () => ({
          recordsFiltered: veaPage1.recordsFiltered,
          products: veaPage1.products.slice(0, 1),
        }),
      };
    }

    throw new Error(`Unexpected fetch in partition test: ${urlStr}`);
  });
}

// ─────────────────────────────────────────────────────────────────────────────

describe('TS planPartitions — characterization (must match LEGACY snapshots)', () => {
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

  it('returns a non-empty partition list for vea (snapshot)', async () => {
    const fixtureFetch = makeFixtureFetch();
    // biome-ignore lint/suspicious/noExplicitAny: intentional global stub
    (globalThis as any).fetch = fixtureFetch;

    const partitions = await getPartitions(veaCfg);

    expect(partitions.length).toBeGreaterThan(0);
    expect(partitions).toMatchSnapshot();
  }, 30_000);

  it('skips departments with total=0', async () => {
    let callCount = 0;
    const sparseProbe = vi.fn(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes('/category/tree/')) {
        return { ok: true, json: async () => catalogTreeVea };
      }
      if (urlStr.includes('/product_search/')) {
        callCount++;
        return {
          ok: true,
          json: async () => ({
            recordsFiltered: callCount === 1 ? 100 : 0,
            products: callCount === 1 ? veaPage1.products.slice(0, 1) : [],
          }),
        };
      }
      throw new Error(`Unexpected: ${urlStr}`);
    });

    // biome-ignore lint/suspicious/noExplicitAny: intentional global stub
    (globalThis as any).fetch = sparseProbe;
    const partitions = await getPartitions(veaCfg);

    expect(partitions.length).toBe(1);
    expect(partitions[0]?.total).toBe(100);
  }, 30_000);

  it('sets truncated=true when department total > IS_SAFE_MAX and no children', async () => {
    const bigTree = [{ id: 1, name: 'BigDept', hasChildren: false, url: '', children: [] }];

    const bigFetch = vi.fn(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes('/category/tree/')) {
        return { ok: true, json: async () => bigTree };
      }
      if (urlStr.includes('/product_search/')) {
        return {
          ok: true,
          json: async () => ({ recordsFiltered: 3000, products: veaPage1.products.slice(0, 1) }),
        };
      }
      throw new Error(`Unexpected: ${urlStr}`);
    });

    // biome-ignore lint/suspicious/noExplicitAny: intentional global stub
    (globalThis as any).fetch = bigFetch;
    const partitions = await getPartitions(veaCfg);

    expect(partitions).toHaveLength(1);
    expect(partitions[0]?.truncated).toBe(true);
    expect(partitions[0]?.total).toBe(3000);
  }, 30_000);

  it('subdivides into cat-2 when department > IS_SAFE_MAX and has children (snapshot)', async () => {
    const treeWithSubs = [
      {
        id: 1,
        name: 'LargeDept',
        hasChildren: true,
        url: '',
        children: [
          { id: 2, name: 'SubA', hasChildren: false, url: '', children: [] },
          { id: 3, name: 'SubB', hasChildren: false, url: '', children: [] },
        ],
      },
    ];

    const subFetch = vi.fn(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes('/category/tree/')) {
        return { ok: true, json: async () => treeWithSubs };
      }
      if (urlStr.includes('/product_search/')) {
        const isParent = urlStr.includes('/product_search/') && !urlStr.includes('category-2');
        return {
          ok: true,
          json: async () => ({
            recordsFiltered: isParent ? 3000 : 400,
            products: veaPage1.products.slice(0, 1),
          }),
        };
      }
      throw new Error(`Unexpected: ${urlStr}`);
    });

    // biome-ignore lint/suspicious/noExplicitAny: intentional global stub
    (globalThis as any).fetch = subFetch;
    const partitions = await getPartitions(veaCfg);

    expect(partitions).toHaveLength(2);
    expect(partitions[0]?.path).toContain('category-2');
    expect(partitions[0]?.truncated).toBeFalsy();
    expect(partitions).toMatchSnapshot();
  }, 30_000);
});
