import { describe, expect, it } from 'vitest';
import { buildProductsQuery } from './query.js';

const NORM_EXPR = "lower(regexp_replace(immutable_unaccent(name), '[^a-z0-9]+', ' ', 'g'))";

describe('buildProductsQuery', () => {
  describe('default / empty params', () => {
    it('produces 1=1 WHERE with no bindings', () => {
      const { sql, bindings, countSql } = buildProductsQuery({});
      expect(bindings).toHaveLength(0);
      expect(sql).toContain('WHERE 1=1');
      expect(countSql).toContain('WHERE 1=1');
    });

    it('default pagination: page=1, limit=48, offset=0', () => {
      const { page, limit, sql } = buildProductsQuery({});
      expect(page).toBe(1);
      expect(limit).toBe(48);
      expect(sql).toContain('LIMIT 48 OFFSET 0');
    });

    it('default ORDER BY is discount_pct DESC, name ASC', () => {
      const { sql } = buildProductsQuery({});
      expect(sql).toContain('ORDER BY discount_pct DESC, name ASC');
    });
  });

  describe('q filter', () => {
    it('adds a single tokenized NORM_EXPR LIKE binding', () => {
      const { sql, bindings } = buildProductsQuery({ q: 'leche' });
      expect(bindings).toEqual(['%leche%']);
      expect(sql).toContain(`${NORM_EXPR} LIKE ?`);
    });

    it('splits q into one AND-ed token per word', () => {
      const { sql, bindings } = buildProductsQuery({ q: 'leche entera' });
      expect(bindings).toEqual(['%leche%', '%entera%']);
      expect(sql).toContain(`${NORM_EXPR} LIKE ? AND ${NORM_EXPR} LIKE ?`);
    });

    it('normalizes tokens (accent/punctuation insensitive)', () => {
      const { bindings } = buildProductsQuery({ q: 'Coca-Cola Café' });
      expect(bindings).toEqual(['%coca%', '%cola%', '%cafe%']);
    });

    it('adds no name condition when q has no usable tokens', () => {
      const { sql, bindings } = buildProductsQuery({ q: '-' });
      expect(bindings).toEqual([]);
      expect(sql).not.toContain('immutable_unaccent');
    });
  });

  describe('super filter', () => {
    it('adds super = ? binding', () => {
      const { sql, bindings } = buildProductsQuery({ super: 'vea' });
      expect(bindings).toEqual(['vea']);
      expect(sql).toContain('super = ?');
    });
  });

  describe('category filter', () => {
    it('adds one OR clause per vtex string using ILIKE', () => {
      const vtexStrings = ['Lácteos', 'Frescos'];
      const { sql, bindings } = buildProductsQuery({
        category: 'lacteos',
        vtexStrings,
      });
      expect(bindings).toEqual(['%Lácteos%', '%Frescos%']);
      expect(sql).toContain('categories::text ILIKE ?');
      expect(sql).toContain(' OR ');
    });

    it('adds no category clause when vtexStrings is empty', () => {
      const { sql, bindings } = buildProductsQuery({
        category: 'unknown-slug',
        vtexStrings: [],
      });
      expect(bindings).toHaveLength(0);
      expect(sql).not.toContain('categories');
    });

    it('adds no category clause when vtexStrings is undefined', () => {
      const { sql, bindings } = buildProductsQuery({ category: 'lacteos' });
      expect(bindings).toHaveLength(0);
      expect(sql).not.toContain('categories');
    });
  });

  describe('discount filter', () => {
    it('adds discount_pct > 0 when discount=1', () => {
      const { sql, bindings } = buildProductsQuery({ discount: '1' });
      expect(sql).toContain('discount_pct > 0');
      expect(bindings).toHaveLength(0);
    });

    it('does NOT add discount_pct > 0 WHERE clause when discount is not "1"', () => {
      const { sql } = buildProductsQuery({ discount: '0' });
      expect(sql).not.toContain('discount_pct > 0');
    });
  });

  describe('available filter', () => {
    it('adds available = true when available=1', () => {
      const { sql, bindings } = buildProductsQuery({ available: '1' });
      expect(sql).toContain('available = true');
      expect(bindings).toHaveLength(0);
    });

    it('does NOT add available clause when available is not "1"', () => {
      const { sql } = buildProductsQuery({ available: '0' });
      expect(sql).not.toContain('available = true');
    });
  });

  describe('pagination', () => {
    it('respects custom page and limit', () => {
      const { page, limit, sql } = buildProductsQuery({ page: '3', limit: '20' });
      expect(page).toBe(3);
      expect(limit).toBe(20);
      expect(sql).toContain('LIMIT 20 OFFSET 40');
    });

    it('clamps limit to 100 max', () => {
      const { limit, sql } = buildProductsQuery({ limit: '999' });
      expect(limit).toBe(100);
      expect(sql).toContain('LIMIT 100');
    });

    it('clamps page to 1 minimum', () => {
      const { page, sql } = buildProductsQuery({ page: '0' });
      expect(page).toBe(1);
      expect(sql).toContain('OFFSET 0');
    });

    it('handles non-numeric page gracefully (defaults to 1)', () => {
      const { page } = buildProductsQuery({ page: 'abc' });
      expect(page).toBe(1);
    });

    it('handles non-numeric limit gracefully (defaults to 48)', () => {
      const { limit } = buildProductsQuery({ limit: 'abc' });
      expect(limit).toBe(48);
    });

    it('page=2 limit=10 produces OFFSET 10', () => {
      const { sql } = buildProductsQuery({ page: '2', limit: '10' });
      expect(sql).toContain('LIMIT 10 OFFSET 10');
    });
  });

  describe('combined filters', () => {
    it('combines q + super + discount', () => {
      const { sql, bindings } = buildProductsQuery({
        q: 'arroz',
        super: 'carrefour',
        discount: '1',
      });
      expect(bindings).toEqual(['%arroz%', 'carrefour']);
      expect(sql).toContain('immutable_unaccent');
      expect(sql).toContain('super = ?');
      expect(sql).toContain('discount_pct > 0');
    });

    it('combines category + available + pagination', () => {
      const { sql, bindings } = buildProductsQuery({
        category: 'bebidas',
        vtexStrings: ['Bebidas', 'Gaseosas'],
        available: '1',
        page: '2',
        limit: '24',
      });
      expect(bindings).toEqual(['%Bebidas%', '%Gaseosas%']);
      expect(sql).toContain('available = true');
      expect(sql).toContain('LIMIT 24 OFFSET 24');
    });

    it('countSql has same WHERE clause as main sql', () => {
      const { sql, countSql, bindings } = buildProductsQuery({
        q: 'leche',
        super: 'vea',
      });
      // Extract WHERE clause from both
      const mainWhere = sql.split('WHERE')[1]?.split('ORDER')[0]?.trim();
      const countWhere = countSql.split('WHERE')[1]?.trim();
      expect(mainWhere).toBe(countWhere);
      expect(bindings).toEqual(['%leche%', 'vea']);
    });
  });
});
