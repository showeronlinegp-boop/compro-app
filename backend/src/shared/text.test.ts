import type { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { buildNameSearch, normalizeSearchText } from './text.js';

// Prisma.Sql is a type, not a runtime class. Duck-type check via .strings and .values.
function isPrismaSql(v: unknown): v is Prisma.Sql {
  return (
    v !== null &&
    typeof v === 'object' &&
    Array.isArray((v as Prisma.Sql).strings) &&
    Array.isArray((v as Prisma.Sql).values)
  );
}

describe('normalizeSearchText', () => {
  it('lowercases, strips accents, and collapses punctuation to single spaces', () => {
    expect(normalizeSearchText('Gaseosa Coca-Cola Zero 2,5 Lt.')).toBe(
      'gaseosa coca cola zero 2 5 lt',
    );
    expect(normalizeSearchText('Café  Molido')).toBe('cafe molido');
    expect(normalizeSearchText('  Almacén / Bebidas  ')).toBe('almacen bebidas');
  });

  it('returns empty string for punctuation-only input', () => {
    expect(normalizeSearchText('-')).toBe('');
    expect(normalizeSearchText('   ')).toBe('');
  });
});

describe('buildNameSearch', () => {
  it('returns a Prisma.Sql fragment (not null) for a valid query', () => {
    const r = buildNameSearch('coca cola zero');
    expect(r).not.toBeNull();
    // Must be a Prisma.Sql shape (has .strings and .values arrays)
    expect(isPrismaSql(r)).toBe(true);
  });

  it('contains each normalized token as a bound value', () => {
    const r = buildNameSearch('coca cola zero');
    expect(r).not.toBeNull();
    // Prisma.Sql exposes .values for the interpolated parameters
    const values = (r as Prisma.Sql).values as string[];
    expect(values).toContain('%coca%');
    expect(values).toContain('%cola%');
    expect(values).toContain('%zero%');
  });

  it('normalizes tokens (accent/punctuation) before binding', () => {
    const r = buildNameSearch('Café-Express');
    expect(r).not.toBeNull();
    const values = (r as Prisma.Sql).values as string[];
    expect(values).toContain('%cafe%');
    expect(values).toContain('%express%');
  });

  it('returns null when the query has no usable tokens', () => {
    expect(buildNameSearch('-')).toBeNull();
    expect(buildNameSearch('   ')).toBeNull();
  });

  it('single-token query returns a Prisma.Sql (not a join)', () => {
    const r = buildNameSearch('leche');
    expect(r).not.toBeNull();
    expect(isPrismaSql(r)).toBe(true);
    const values = (r as Prisma.Sql).values as string[];
    expect(values).toContain('%leche%');
  });

  it('SQL expression references immutable_unaccent (index-compatible)', () => {
    const r = buildNameSearch('leche');
    expect(r).not.toBeNull();
    // .strings contains the raw SQL template parts — verify index expression is present
    const sqlParts = (r as Prisma.Sql).strings.join('');
    expect(sqlParts).toContain('immutable_unaccent');
    expect(sqlParts).toContain('regexp_replace');
  });
});
