/**
 * normalize.ts — Pure, dependency-free string normalization helpers.
 *
 * This module intentionally has NO imports (no Prisma, no infrastructure) so it
 * can be used from the domain layer as well as infrastructure without breaking
 * the hexagonal boundary. Keep it pure.
 */

// Combining diacritical marks block (U+0300–U+036F), left over after NFD
// decomposition. Built from char codes (not a literal class) to avoid embedding
// invisible combining characters in source.
const COMBINING_MARKS = new RegExp(
  `[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`,
  'g',
);

/**
 * Lowercase + strip diacritics, preserving every other character (spaces,
 * punctuation, wildcards). Unlike normalizeSearchText in shared/text.ts, this
 * does NOT collapse non-alphanumerics — use it for substring/.includes()
 * matching where the original spacing and symbols must be kept (e.g. VTEX
 * category paths, LIKE patterns containing '%', product-name keyword matching).
 *
 * NOTE: Do NOT use this to build the keyword for the SQL
 * `translate(lower(name), 'áéíóúüñàèìòù', 'aeiouunaeiou')` filter — that path
 * needs a char-set identical to the SQL translate() mapping (see normalizeKeyword
 * in list-generator.repo.ts).
 */
export function stripDiacritics(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(COMBINING_MARKS, '');
}
