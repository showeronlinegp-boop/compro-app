/**
 * dedup.ts — Seen-Map merge for crawl pages.
 *
 * Port of the dedup / merge logic inside crawlPartition() from vtex-crawler.js.
 * PURE — no IO. Mutates the `seen` Map in-place (same semantics as legacy).
 *
 * Rules (identical to legacy):
 *   - If productId already in seen: union category_paths (no-dupe append).
 *   - If productId new: add to seen; if category_paths is empty, use partitionName.
 */

import type { NormalizedCrawlItem, Partition } from '../../shared/types.js';

/**
 * Merge a page of normalized items into the seen Map.
 * Also adds each productId to touchedIds.
 *
 * @param items - Normalized items from one IS page (nulls already filtered).
 * @param seen - Accumulator Map (productId → item). Mutated in-place.
 * @param touchedIds - Set of productIds touched in this partition crawl. Mutated in-place.
 * @param partition - Current partition (used as fallback category name).
 */
export function mergeItems(
  items: NormalizedCrawlItem[],
  seen: Map<string, NormalizedCrawlItem>,
  touchedIds: Set<string>,
  partition: Partition,
): void {
  for (const norm of items) {
    const existing = seen.get(norm.product_id);
    if (existing) {
      // Union category_paths
      for (const c of norm.category_paths) {
        if (!existing.category_paths.includes(c)) existing.category_paths.push(c);
      }
    } else {
      // Fallback category: partition name when no categories
      if (!norm.category_paths.length) norm.category_paths = [partition.name];
      seen.set(norm.product_id, norm);
    }
    touchedIds.add(norm.product_id);
  }
}
