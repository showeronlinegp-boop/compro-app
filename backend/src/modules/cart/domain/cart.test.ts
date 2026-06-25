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
  it('returns the value unchanged when 1 <= n <= 999', () => {
    expect(clampQty(1)).toBe(1);
    expect(clampQty(5)).toBe(5);
    expect(clampQty(999)).toBe(999);
  });

  it('throws a 400-tagged Error when n < 1', () => {
    expect(() => clampQty(0)).toThrowError(
      expect.objectContaining({
        message: expect.stringContaining('La cantidad debe ser al menos 1'),
        statusCode: 400,
      }),
    );
    expect(() => clampQty(-1)).toThrowError(
      expect.objectContaining({
        message: expect.stringContaining('La cantidad debe ser al menos 1'),
        statusCode: 400,
      }),
    );
  });

  it('throws a 400-tagged Error when n > 999', () => {
    expect(() => clampQty(1000)).toThrowError(
      expect.objectContaining({
        message: expect.stringContaining('La cantidad no puede superar 999'),
        statusCode: 400,
      }),
    );
  });
});
