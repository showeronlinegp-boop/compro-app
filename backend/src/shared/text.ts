/**
 * text.ts — search-text normalization shared between JS tokenization and the
 * `norm(...)` SQL function registered on the DB connection (see db/client.ts).
 *
 * Both sides MUST use normalizeSearchText so query tokens and stored names are
 * compared on the same footing.
 */

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
 * Build a tokenized name-search SQL fragment for a free-text query.
 *
 * Each whitespace-separated token must appear in the normalized name (AND), so
 * word order and punctuation no longer matter: "coca cola zero" matches both
 * "Coca-Cola Zero 2,5 Lt." and "Zero Sabor Cola ... Coca Cola".
 *
 * Returns null when the query yields no usable tokens — the caller then adds no
 * name condition. Relies on the `norm(name)` SQL function from db/client.ts.
 */
export function buildNameSearch(q: string): { clause: string; bindings: string[] } | null {
  const tokens = normalizeSearchText(q).split(' ').filter(Boolean);
  if (tokens.length === 0) return null;
  return {
    clause: tokens.map(() => 'norm(name) LIKE ?').join(' AND '),
    bindings: tokens.map((t) => `%${t}%`),
  };
}
