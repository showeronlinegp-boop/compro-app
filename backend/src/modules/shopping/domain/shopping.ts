import type { ShoppingItem } from '../../../shared/types.js';

// Re-export for consumers that import from the domain layer
export type { ShoppingItem };

/**
 * Returns true if the shopping item is due this week.
 * Mirrors the WHERE clause used in the weekly SQL query:
 *   last_bought IS NULL OR (julianday('now') - julianday(last_bought)) >= frequency_days
 *
 * Note: the authoritative implementation lives in SQL (julianday). This pure
 * helper is provided for testing and display logic only.
 */
export function isDue(item: Pick<ShoppingItem, 'last_bought' | 'frequency_days'>): boolean {
  if (item.last_bought === null) return true;
  const daysSince = (Date.now() - new Date(item.last_bought).getTime()) / (1000 * 60 * 60 * 24);
  return daysSince >= item.frequency_days;
}
