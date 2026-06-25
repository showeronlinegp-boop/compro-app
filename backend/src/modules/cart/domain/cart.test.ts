import { describe, expect, it } from 'vitest';
import { clampQty, sumItemCount } from './cart.js';

describe('sumItemCount', () => {
  it('returns 0 for an empty array', () => {
    expect(sumItemCount([])).toBe(0);
  });

  it('returns the quantity when there is a single item', () => {
    expect(sumItemCount([{ quantity: 3 }])).toBe(3);
  });

  it('sums quantities across multiple items', () => {
    expect(sumItemCount([{ quantity: 2 }, { quantity: 5 }, { quantity: 1 }])).toBe(8);
  });
});

describe('clampQty', () => {
  it('returns the value unchanged when n >= 1', () => {
    expect(clampQty(1)).toBe(1);
    expect(clampQty(5)).toBe(5);
    expect(clampQty(100)).toBe(100);
  });

  it('throws a 400-tagged Error when n < 1', () => {
    expect(() => clampQty(0)).toThrow('La cantidad debe ser al menos 1');
    expect(() => clampQty(-1)).toThrow('La cantidad debe ser al menos 1');
  });

  it('attaches statusCode 400 to the thrown error', () => {
    try {
      clampQty(0);
    } catch (err) {
      expect((err as Error & { statusCode?: number }).statusCode).toBe(400);
    }
  });
});
