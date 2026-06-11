/**
 * partition.ts — Partition type + planning pure functions.
 *
 * Port of getPartitions() from vtex-crawler.js.
 * PURE — no IO. Takes the catalog tree and probe counts as inputs,
 * returns the partition plan.
 *
 * The catalog tree and probe counts are fetched by the crawler service
 * (infrastructure layer) and injected here.
 */

import { CRAWLER_IS_SAFE_MAX, CRAWLER_PAGE_SIZE } from '../../config/throttles.js';
import type { Partition } from '../../shared/types.js';

export type { Partition };

/** Re-export constants used by the crawl loop. */
export { CRAWLER_IS_SAFE_MAX, CRAWLER_PAGE_SIZE };

/** Catalog tree node shape (from catalog_system API). */
export interface TreeNode {
  id: number;
  name: string;
  hasChildren: boolean;
  url: string;
  children: TreeNode[];
}

/**
 * Compute the maximum number of IS pages for a given total.
 * Identical to vtex-crawler.js: Math.ceil(Math.min(total, IS_SAFE_MAX) / PAGE_SIZE)
 */
export function maxPages(total: number): number {
  return Math.ceil(Math.min(total, CRAWLER_IS_SAFE_MAX) / CRAWLER_PAGE_SIZE);
}

/**
 * Build the partition plan from the catalog tree and per-path probe counts.
 *
 * probeCounts maps facetPath → total (0 means skip).
 * Exactly mirrors getPartitions() logic:
 *   - total=0 → skip
 *   - total ≤ IS_SAFE_MAX → single partition
 *   - total > IS_SAFE_MAX && no children → truncated partition
 *   - total > IS_SAFE_MAX && has children → subdivide into cat-2 partitions
 *
 * @param tree - Catalog category tree (depth-2 nodes).
 * @param probeCounts - Map from facetPath to IS product_search recordsFiltered.
 */
export function planPartitions(tree: TreeNode[], probeCounts: Map<string, number>): Partition[] {
  const partitions: Partition[] = [];

  for (const dept of tree) {
    const path1 = `category-1/${dept.name}`;
    const total1 = probeCounts.get(path1) ?? 0;

    if (total1 === 0) continue;

    if (total1 <= CRAWLER_IS_SAFE_MAX) {
      partitions.push({ path: path1, name: dept.name, total: total1 });
      continue;
    }

    // Department exceeds IS_SAFE_MAX — try to subdivide
    const subs = dept.children ?? [];
    if (!subs.length) {
      // No subcategories: include as truncated
      partitions.push({ path: path1, name: dept.name, total: total1, truncated: true });
      continue;
    }

    for (const sub of subs) {
      const path2 = `category-1/${dept.name}/category-2/${sub.name}`;
      const total2 = probeCounts.get(path2) ?? 0;
      if (total2 === 0) continue;
      partitions.push({
        path: path2,
        name: `${dept.name} > ${sub.name}`,
        total: total2,
        truncated: total2 > CRAWLER_IS_SAFE_MAX,
      });
    }
  }

  return partitions;
}
