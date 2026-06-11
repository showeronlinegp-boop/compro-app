import { describe, expect, it } from 'vitest';
import { groupOrderBy, parseSort, rowOrderBy } from './sort.js';

describe('parseSort', () => {
  it('defaults to relevance for undefined / null / empty', () => {
    expect(parseSort(undefined)).toBe('relevance');
    expect(parseSort(null)).toBe('relevance');
    expect(parseSort('')).toBe('relevance');
  });

  it('defaults to relevance for unknown / malicious values', () => {
    expect(parseSort('bogus')).toBe('relevance');
    expect(parseSort('name; DROP TABLE products')).toBe('relevance');
  });

  it('accepts each whitelisted value verbatim', () => {
    expect(parseSort('relevance')).toBe('relevance');
    expect(parseSort('discount_desc')).toBe('discount_desc');
    expect(parseSort('price_asc')).toBe('price_asc');
    expect(parseSort('price_desc')).toBe('price_desc');
  });
});

describe('rowOrderBy', () => {
  it('relevance and discount_desc both rank by discount then name', () => {
    expect(rowOrderBy('relevance')).toBe('discount_pct DESC, name ASC');
    expect(rowOrderBy('discount_desc')).toBe('discount_pct DESC, name ASC');
  });

  it('price_asc ranks by effective price ascending, NULLs last', () => {
    const clause = rowOrderBy('price_asc');
    expect(clause).toContain('COALESCE(offer_price, raw_price) IS NULL');
    expect(clause).toContain('COALESCE(offer_price, raw_price) ASC');
  });

  it('price_desc ranks by effective price descending, NULLs last', () => {
    const clause = rowOrderBy('price_desc');
    expect(clause).toContain('COALESCE(offer_price, raw_price) IS NULL');
    expect(clause).toContain('COALESCE(offer_price, raw_price) DESC');
  });
});

describe('groupOrderBy', () => {
  it('relevance floats discounted groups first, then magnitude, then super_count', () => {
    expect(groupOrderBy('relevance')).toBe(
      'max_discount > 0 DESC, max_discount DESC, super_count DESC, name ASC',
    );
  });

  it('discount_desc ranks strictly by best discount', () => {
    expect(groupOrderBy('discount_desc')).toBe('max_discount DESC, name ASC');
  });

  it('price_asc/desc rank by group min_price with NULLs last', () => {
    expect(groupOrderBy('price_asc')).toBe('min_price IS NULL, min_price ASC, name ASC');
    expect(groupOrderBy('price_desc')).toBe('min_price IS NULL, min_price DESC, name ASC');
  });
});
