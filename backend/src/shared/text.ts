/**
 * text.ts — search-text normalization shared between JS tokenization and the
 * Postgres `immutable_unaccent` SQL function used in $queryRaw search fragments.
 *
 * normalizeSearchText: tokenizes the query on the JS side (unchanged from the
 * SQLite version — the SQL UDF `norm()` contract is now replaced by the inline
 * Postgres expression `lower(regexp_replace(immutable_unaccent(name), '[^a-z0-9]+', ' ', 'g'))`).
 *
 * buildNameSearch: returns a Prisma.Sql fragment (for $queryRaw composition) or
 * null when the query yields no usable tokens. The SQL expression used here MUST
 * exactly match the expression used in the GIN index created by the initial migration:
 *   lower(regexp_replace(immutable_unaccent(name), '[^a-z0-9]+', ' ', 'g'))
 * Using a different expression here would cause the planner to skip the index.
 */

import { Prisma } from '@prisma/client';

// Combining diacritical marks block (U+0300–U+036F), left over after NFD
// decomposition. Built from char codes (not a literal class) to avoid embedding
// invisible combining characters in source.
const COMBINING_MARKS = new RegExp(
  `[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`,
  'g',
);
const NON_ALPHANUMERIC = /[^a-z0-9]+/g;

/**
 * Normalize text for search matching:
 *   - lowercase
 *   - strip diacritics (á → a)
 *   - collapse every run of non-alphanumeric chars (hyphens, dots, commas,
 *     spaces) into a single space
 *
 * e.g. "Gaseosa Coca-Cola Zero 2,5 Lt." → "gaseosa coca cola zero 2 5 lt"
 *
 * This is what makes "coca cola zero" match "Coca-Cola Zero": the hyphen is
 * normalized to a space on both the query and the stored name.
 *
 * NO-TOUCH RULE: This function must remain byte-for-byte identical to its
 * original form. The SQL norm expression on the column side was written to
 * match it exactly.
 */
export function normalizeSearchText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(NON_ALPHANUMERIC, ' ')
    .trim();
}

/**
 * SQL expression used on the column side to normalize product names for search.
 * MUST be kept in sync with:
 *   1. The GIN index expression in the initial migration (or index won't be used).
 *   2. normalizeSearchText (semantically equivalent output for Latin text).
 *
 * immutable_unaccent() is an IMMUTABLE wrapper around unaccent() defined in the
 * migration — bare unaccent() is STABLE and cannot be used in index expressions.
 */
// IMPORTANT: lower() must be applied BEFORE regexp_replace so the regex [^a-z0-9]
// does not strip uppercase letters. Order: unaccent → lower → strip non-alphanum.
const NORM_EXPR = Prisma.sql`regexp_replace(lower(immutable_unaccent(name)), '[^a-z0-9]+', ' ', 'g')`;

/**
 * Build a tokenized name-search SQL fragment for a free-text query.
 *
 * Returns a Prisma.Sql fragment: NORM_EXPR LIKE '%token1%' AND NORM_EXPR LIKE '%token2%' ...
 * Returns null when the query yields no usable tokens — the caller then adds no
 * name condition.
 *
 * The fragment is safe to interpolate into $queryRaw via Prisma.sql template
 * literals — values are parameterized, NORM_EXPR is a constant expression.
 */
export function buildNameSearch(q: string): Prisma.Sql | null {
  const tokens = normalizeSearchText(q).split(' ').filter(Boolean);
  if (tokens.length === 0) return null;

  const parts = tokens.map((t) => Prisma.sql`${NORM_EXPR} LIKE ${'%' + t + '%'}`);

  if (parts.length === 1) return parts[0] as Prisma.Sql;

  // Join with AND — Prisma.join uses a separator between fragments
  return Prisma.join(parts as Prisma.Sql[], ' AND ');
}
