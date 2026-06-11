/**
 * functions.ts — custom SQL functions registered on every app DB connection.
 *
 * Kept separate from createDb so test harnesses that build their own
 * better-sqlite3 instance can register the exact same functions and keep
 * SQL-side behavior identical to production.
 */

import type Database from 'better-sqlite3';
import { normalizeSearchText } from '../../shared/text.js';

/**
 * Register all custom SQL functions on the given connection.
 *
 * - norm(text): normalized search text (lowercase, accent-stripped, punctuation
 *   collapsed to spaces). Used by the catalog name search so "coca cola zero"
 *   matches "Coca-Cola Zero". Deterministic so SQLite may cache/optimize it.
 */
export function registerDbFunctions(db: Database.Database): void {
  db.function('norm', { deterministic: true }, (value: unknown) =>
    normalizeSearchText(value == null ? '' : String(value)),
  );
}
