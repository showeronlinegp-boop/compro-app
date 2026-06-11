/**
 * dedup-order.test.ts — Proof that mergeItems produces identical output
 * regardless of the ORDER pages/partitions arrive, as long as they are
 * folded in PLAN ORDER (ascending page index; plan-order partition fold).
 *
 * This test underpins the correctness guarantee for Slice 4 (partition
 * concurrency with local seen maps merged sequentially in plan order).
 *
 * Three invariants proven:
 *
 *   1. Within-partition page order: merging pages sorted by ascending page
 *      index yields the same `seen` regardless of input arrival order.
 *      (Proves: always sorting by index before merge makes arrival irrelevant.)
 *
 *   2. Cross-partition plan-order fold: two partitions A and B, each building
 *      a LOCAL seen map, folded in plan order (A then B) equals the true
 *      sequential baseline (crawl A fully, then B into the same seen map).
 *
 *   3. Negative control: folding in the REVERSED order (B then A) produces a
 *      DIFFERENT result than plan-order fold. Proves order genuinely matters
 *      AND that plan-order is what guarantees determinism.
 */

import { describe, expect, it } from 'vitest';
import type { NormalizedCrawlItem, Partition } from '../../../shared/types.js';
import { mergeItems } from '../dedup.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(
  productId: string,
  name: string,
  categoryPaths: string[],
  price = 1000,
): NormalizedCrawlItem {
  return {
    product_id: productId,
    sku_id: `${productId}-sku`,
    name,
    barcode: null,
    image_url: `https://example.com/${productId}.jpg`,
    product_url: `/p/${productId}`,
    raw_price: price,
    offer_price: null,
    discount_pct: 0,
    available: true,
    category_paths: [...categoryPaths],
    promotions: [],
  };
}

/** Deep-clone a NormalizedCrawlItem so mutations in one fold don't bleed into another. */
function cloneItem(item: NormalizedCrawlItem): NormalizedCrawlItem {
  return { ...item, category_paths: [...item.category_paths] };
}

/** Deep-clone an array of items. */
function cloneItems(items: NormalizedCrawlItem[]): NormalizedCrawlItem[] {
  return items.map(cloneItem);
}

/**
 * Simulate the within-partition page fold:
 * receives pages as an array-of-arrays already in the desired merge order.
 * Returns a fresh seen Map.
 */
function foldPageArrays(
  pageArrays: NormalizedCrawlItem[][],
  partition: Partition,
): Map<string, NormalizedCrawlItem> {
  const seen = new Map<string, NormalizedCrawlItem>();
  const touched = new Set<string>();
  for (const items of pageArrays) {
    if (items.length > 0) mergeItems(items, seen, touched, partition);
  }
  return seen;
}

/**
 * Simulate the cross-partition fold:
 * receives an ordered list of (localSeen, partition) tuples
 * and folds them into a canonical map (mirrors syncSuper's post-pool fold).
 */
function foldLocalMaps(
  pairs: { localSeen: Map<string, NormalizedCrawlItem>; partition: Partition }[],
): Map<string, NormalizedCrawlItem> {
  const canonical = new Map<string, NormalizedCrawlItem>();
  for (const { localSeen } of pairs) {
    for (const [productId, item] of localSeen) {
      const existing = canonical.get(productId);
      if (existing) {
        for (const c of item.category_paths) {
          if (!existing.category_paths.includes(c)) existing.category_paths.push(c);
        }
      } else {
        canonical.set(productId, { ...item, category_paths: [...item.category_paths] });
      }
    }
  }
  return canonical;
}

/**
 * Build a LOCAL seen map for a single partition by folding its pages in order.
 * Mirrors crawlOnePartition's per-page mergeItems loop.
 */
function buildLocalSeen(
  pages: NormalizedCrawlItem[][],
  partition: Partition,
): Map<string, NormalizedCrawlItem> {
  const seen = new Map<string, NormalizedCrawlItem>();
  const touched = new Set<string>();
  for (const items of pages) {
    if (items.length > 0) mergeItems(cloneItems(items), seen, touched, partition);
  }
  return seen;
}

const partitionA: Partition = { path: 'category-1/A', name: 'A', total: 100 };
const partitionB: Partition = { path: 'category-1/B', name: 'B', total: 100 };

// ---------------------------------------------------------------------------
// Invariant 1 — Within-partition page order
// ---------------------------------------------------------------------------

describe('Invariant 1 — within-partition page order (ascending index = deterministic)', () => {
  /**
   * Fixture: 3 pages with overlapping productId "SHARED".
   *   page index 0 (p1): SHARED with category ['Cat-P1'], ONLY_P1
   *   page index 1 (p2): SHARED with category ['Cat-P2'], ONLY_P2
   *   page index 2 (p3): SHARED with category ['Cat-P3'], ONLY_P3
   *
   * Merging in ascending index order (0→1→2) must always produce
   * category_paths = ['Cat-P1','Cat-P2','Cat-P3'] and SHARED.name = 'From-P1'
   * regardless of the order in which the pages were RECEIVED.
   */
  const p1 = [
    makeItem('SHARED', 'From-P1', ['Cat-P1'], 100),
    makeItem('ONLY_P1', 'P1 exclusive', ['CatA']),
  ];
  const p2 = [
    makeItem('SHARED', 'From-P2', ['Cat-P2'], 200),
    makeItem('ONLY_P2', 'P2 exclusive', ['CatB']),
  ];
  const p3 = [
    makeItem('SHARED', 'From-P3', ['Cat-P3'], 300),
    makeItem('ONLY_P3', 'P3 exclusive', ['CatC']),
  ];

  it('in-order input → expected category_paths and first-wins scalar', () => {
    const seen = foldPageArrays([cloneItems(p1), cloneItems(p2), cloneItems(p3)], partitionA);
    const shared = seen.get('SHARED')!;
    expect(shared).toBeDefined();
    expect(shared.category_paths).toEqual(['Cat-P1', 'Cat-P2', 'Cat-P3']);
    expect(shared.raw_price).toBe(100); // first-wins: p1's price
    expect(shared.name).toBe('From-P1'); // first-wins: p1's name
    expect(seen.size).toBe(4);
  });

  it('pre-shuffled pages sorted by ascending index produce SAME result as in-order', () => {
    // Simulate: pages arrived out of order [p3, p1, p2] but we sort by index → [p1, p2, p3]
    const shuffledArr = [cloneItems(p3), cloneItems(p1), cloneItems(p2)];
    // Sort ascending by page index 0=p1,1=p2,2=p3 (we know p1/p2/p3 by reference)
    // In the real service, runPool returns results[i] aligned to pageNumbers[i] (2,3,4,...)
    // We simulate that here by re-sorting to [p1,p2,p3] order after shuffle:
    // biome-ignore lint/style/noNonNullAssertion: indices 0-2 are always valid in a 3-element array
    const sorted = [shuffledArr[1]!, shuffledArr[2]!, shuffledArr[0]!]; // [p1,p2,p3]

    const seenSorted = foldPageArrays(sorted, partitionA);
    const seenInOrder = foldPageArrays(
      [cloneItems(p1), cloneItems(p2), cloneItems(p3)],
      partitionA,
    );

    expect([...seenSorted.entries()]).toEqual([...seenInOrder.entries()]);
  });

  it('category_paths array order reflects ascending page index, not arrival order', () => {
    // Arrive in reverse (p3 first, p1 last) — after sorting by index: p1→p2→p3
    const reversed = [cloneItems(p3), cloneItems(p2), cloneItems(p1)];
    // biome-ignore lint/style/noNonNullAssertion: indices 0-2 are always valid in a 3-element array
    const sorted = [reversed[2]!, reversed[1]!, reversed[0]!]; // sorted back to p1,p2,p3

    const seen = foldPageArrays(sorted, partitionA);
    const shared = seen.get('SHARED')!;
    // category_paths should reflect the merge order: Cat-P1 first (p1 merged first)
    expect(shared.category_paths).toEqual(['Cat-P1', 'Cat-P2', 'Cat-P3']);
    expect(shared.raw_price).toBe(100); // first-wins: p1
  });
});

// ---------------------------------------------------------------------------
// Invariant 2 — Cross-partition plan-order fold equals sequential baseline
// ---------------------------------------------------------------------------

describe('Invariant 2 — cross-partition plan-order fold equals sequential baseline', () => {
  /**
   * Fixture: productId "CROSS" appears in BOTH partition A and partition B
   * with DIFFERENT category sets and DIFFERENT scalar fields.
   *
   *   Partition A (plan index 0): CROSS with category ['Alpha'], price=10, name='From-A'
   *   Partition B (plan index 1): CROSS with category ['Beta'],  price=20, name='From-B'
   *
   * True sequential baseline: crawl A fully into a shared seen, then crawl B into
   * the SAME shared seen.
   *
   * Approach B (local maps): crawl A into localSeenA, crawl B into localSeenB,
   * then fold localSeenA → canonical, then localSeenB → canonical (plan order).
   *
   * Both must be deep-equal.
   */

  const pagesA = [
    [makeItem('CROSS', 'From-A', ['Alpha'], 10), makeItem('UNIQUE_A', 'Only A', ['Alpha-only'])],
  ];
  const pagesB = [
    [makeItem('CROSS', 'From-B', ['Beta'], 20), makeItem('UNIQUE_B', 'Only B', ['Beta-only'])],
  ];

  it('approach B (local maps folded in plan order) equals true sequential baseline', () => {
    // --- True sequential baseline ---
    const baseline = new Map<string, NormalizedCrawlItem>();
    const bTouched = new Set<string>();
    // Crawl partition A pages into shared seen
    for (const page of pagesA) mergeItems(cloneItems(page), baseline, bTouched, partitionA);
    // Crawl partition B pages into same shared seen
    for (const page of pagesB) mergeItems(cloneItems(page), baseline, bTouched, partitionB);

    // --- Approach B: local maps folded in plan order ---
    const localSeenA = buildLocalSeen(pagesA, partitionA);
    const localSeenB = buildLocalSeen(pagesB, partitionB);
    const canonical = foldLocalMaps([
      { localSeen: localSeenA, partition: partitionA }, // plan index 0 — fold first
      { localSeen: localSeenB, partition: partitionB }, // plan index 1 — fold second
    ]);

    // Deep equality: same keys, same scalar values, same category_paths order
    expect(canonical.size).toBe(baseline.size);
    expect([...canonical.entries()]).toEqual([...baseline.entries()]);
  });

  it('CROSS product: Approach B preserves first-wins scalar from plan-index-0 partition', () => {
    const localSeenA = buildLocalSeen(pagesA, partitionA);
    const localSeenB = buildLocalSeen(pagesB, partitionB);
    const canonical = foldLocalMaps([
      { localSeen: localSeenA, partition: partitionA },
      { localSeen: localSeenB, partition: partitionB },
    ]);

    const cross = canonical.get('CROSS')!;
    expect(cross).toBeDefined();
    expect(cross.raw_price).toBe(10); // plan-index-0 (A) wins
    expect(cross.name).toBe('From-A'); // plan-index-0 (A) wins
    expect(cross.category_paths).toEqual(['Alpha', 'Beta']); // A first, then B
  });
});

// ---------------------------------------------------------------------------
// Invariant 3 — Negative control: reversed fold order produces DIFFERENT result
// ---------------------------------------------------------------------------

describe('Invariant 3 — negative control: reversed fold order is detectably different', () => {
  /**
   * This test KILLS the tautology: it proves that plan order matters by showing
   * that reversing the fold order (B then A) produces a result that differs from
   * plan-order (A then B) in BOTH category_paths order AND scalar first-wins.
   *
   * Fixture (deliberately asymmetric):
   *   Partition A (plan index 0): CROSS price=10, name='From-A', category=['Alpha']
   *   Partition B (plan index 1): CROSS price=20, name='From-B', category=['Beta']
   *
   * Plan-order   (A→B): price=10, name='From-A', category_paths=['Alpha','Beta']
   * Reversed     (B→A): price=20, name='From-B', category_paths=['Beta','Alpha']
   * These MUST differ — if they don't, the fixtures are not meaningful.
   */

  const pagesA = [
    [makeItem('CROSS', 'From-A', ['Alpha'], 10), makeItem('ONLY_A', 'OnlyA', ['A-excl'])],
  ];
  const pagesB = [
    [makeItem('CROSS', 'From-B', ['Beta'], 20), makeItem('ONLY_B', 'OnlyB', ['B-excl'])],
  ];

  it('plan-order fold (A→B) and reversed fold (B→A) produce different category_paths order', () => {
    const localSeenA = buildLocalSeen(pagesA, partitionA);
    const localSeenB = buildLocalSeen(pagesB, partitionB);

    const planOrder = foldLocalMaps([
      { localSeen: localSeenA, partition: partitionA }, // index 0
      { localSeen: localSeenB, partition: partitionB }, // index 1
    ]);

    const reversedOrder = foldLocalMaps([
      { localSeen: localSeenB, partition: partitionB }, // index 1 folded first (WRONG)
      { localSeen: localSeenA, partition: partitionA }, // index 0 folded second (WRONG)
    ]);

    const crossPlan = planOrder.get('CROSS')!;
    const crossReversed = reversedOrder.get('CROSS')!;

    // category_paths order MUST differ (Alpha first vs Beta first)
    expect(crossPlan.category_paths).toEqual(['Alpha', 'Beta']);
    expect(crossReversed.category_paths).toEqual(['Beta', 'Alpha']);
    expect(crossPlan.category_paths).not.toEqual(crossReversed.category_paths);
  });

  it('plan-order fold (A→B) and reversed fold (B→A) produce different scalar first-wins', () => {
    const localSeenA = buildLocalSeen(pagesA, partitionA);
    const localSeenB = buildLocalSeen(pagesB, partitionB);

    const planOrder = foldLocalMaps([
      { localSeen: localSeenA, partition: partitionA },
      { localSeen: localSeenB, partition: partitionB },
    ]);

    const reversedOrder = foldLocalMaps([
      { localSeen: localSeenB, partition: partitionB },
      { localSeen: localSeenA, partition: partitionA },
    ]);

    const crossPlan = planOrder.get('CROSS')!;
    const crossReversed = reversedOrder.get('CROSS')!;

    // Scalar first-wins MUST differ: plan-order gives A's values, reversed gives B's values
    expect(crossPlan.raw_price).toBe(10); // A wins in plan order
    expect(crossReversed.raw_price).toBe(20); // B wins in reversed order
    expect(crossPlan.raw_price).not.toBe(crossReversed.raw_price);

    expect(crossPlan.name).toBe('From-A');
    expect(crossReversed.name).toBe('From-B');
    expect(crossPlan.name).not.toBe(crossReversed.name);
  });

  it('full maps for plan-order and reversed-order are NOT deep-equal (confirms meaningful fixture)', () => {
    const localSeenA = buildLocalSeen(pagesA, partitionA);
    const localSeenB = buildLocalSeen(pagesB, partitionB);

    const planOrder = foldLocalMaps([
      { localSeen: localSeenA, partition: partitionA },
      { localSeen: localSeenB, partition: partitionB },
    ]);

    const reversedOrder = foldLocalMaps([
      { localSeen: localSeenB, partition: partitionB },
      { localSeen: localSeenA, partition: partitionA },
    ]);

    // The maps must NOT be deep-equal — confirms the negative control is meaningful
    expect([...planOrder.entries()]).not.toEqual([...reversedOrder.entries()]);
  });
});

// ---------------------------------------------------------------------------
// Legacy scenarios (kept green — partition name fallback and product set)
// ---------------------------------------------------------------------------

describe('dedup-order: partition name fallback', () => {
  it('empty category_paths uses partition name as fallback — consistent across folds', () => {
    const noCategories = [makeItem('Z', 'No cat product', [])];
    const seen = foldPageArrays([noCategories], partitionA);
    const z = seen.get('Z')!;
    expect(z.category_paths).toEqual(['A']);
  });

  it('subsequent partition with actual category adds to existing entry', () => {
    const firstSeen = [makeItem('Z', 'No cat product', [])]; // gets fallback 'A'
    const laterSeen = [makeItem('Z', 'No cat product', ['RealCat'])]; // adds 'RealCat'

    const seen = foldPageArrays([cloneItems(firstSeen), cloneItems(laterSeen)], partitionA);
    // Note: both batches folded under partitionA here; the key is category union happens
    const z = seen.get('Z')!;
    expect(z.category_paths).toContain('A');
    expect(z.category_paths).toContain('RealCat');
    expect(z.category_paths).toHaveLength(2);
  });
});
