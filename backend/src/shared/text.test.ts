import { describe, expect, it } from 'vitest';
import { buildNameSearch, normalizeSearchText } from './text.js';

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
  it('emits one AND-ed norm(name) LIKE clause per token', () => {
    const r = buildNameSearch('coca cola zero');
    expect(r).not.toBeNull();
    expect(r?.clause).toBe('norm(name) LIKE ? AND norm(name) LIKE ? AND norm(name) LIKE ?');
    expect(r?.bindings).toEqual(['%coca%', '%cola%', '%zero%']);
  });

  it('normalizes tokens (accent/punctuation) before binding', () => {
    const r = buildNameSearch('Café-Express');
    expect(r?.bindings).toEqual(['%cafe%', '%express%']);
  });

  it('returns null when the query has no usable tokens', () => {
    expect(buildNameSearch('-')).toBeNull();
    expect(buildNameSearch('   ')).toBeNull();
  });
});
