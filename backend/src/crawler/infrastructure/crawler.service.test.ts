/**
 * crawler.service.test.ts — unit tests for fetchPageWithEmptyRetry, the
 * silent-drop guard. The page fetcher is injected so no network is hit.
 */
import { describe, expect, it, vi } from 'vitest';
import { fetchPageWithEmptyRetry, shouldMarkOutOfStock } from './crawler.service.js';

const NO_DELAY = { maxEmptyRetries: 3, emptyRetryDelayMs: 0 };

describe('fetchPageWithEmptyRetry', () => {
  it('returns products on the first try without retrying', async () => {
    const fetchPage = vi.fn().mockResolvedValue({ products: [{ a: 1 }, { a: 2 }], total: 100 });
    const res = await fetchPageWithEmptyRetry(fetchPage, 'Almacén', 1, NO_DELAY);
    expect(res.dropped).toBe(false);
    expect(res.products).toHaveLength(2);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('treats a genuinely empty facet (total=0) as not dropped, no retries', async () => {
    const fetchPage = vi.fn().mockResolvedValue({ products: [], total: 0 });
    const res = await fetchPageWithEmptyRetry(fetchPage, 'Almacén', 1, NO_DELAY);
    expect(res.dropped).toBe(false);
    expect(res.products).toHaveLength(0);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('retries a 200-empty page with total>0 and marks it dropped after exhausting retries', async () => {
    const fetchPage = vi.fn().mockResolvedValue({ products: [], total: 250 });
    const res = await fetchPageWithEmptyRetry(fetchPage, 'Almacén', 3, NO_DELAY);
    expect(res.dropped).toBe(true);
    // initial attempt + 3 retries
    expect(fetchPage).toHaveBeenCalledTimes(4);
  });

  it('recovers when a throttled-empty page returns products on a retry', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ products: [], total: 250 })
      .mockResolvedValueOnce({ products: [{ a: 1 }], total: 250 });
    const res = await fetchPageWithEmptyRetry(fetchPage, 'Almacén', 2, NO_DELAY);
    expect(res.dropped).toBe(false);
    expect(res.products).toHaveLength(1);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('retries on thrown errors and recovers', async () => {
    const fetchPage = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce({ products: [{ a: 1 }], total: 50 });
    const res = await fetchPageWithEmptyRetry(fetchPage, 'Almacén', 1, NO_DELAY);
    expect(res.dropped).toBe(false);
    expect(res.products).toHaveLength(1);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('marks dropped when errors outlast the retries', async () => {
    const fetchPage = vi.fn().mockRejectedValue(new Error('429'));
    const res = await fetchPageWithEmptyRetry(fetchPage, 'Almacén', 5, NO_DELAY);
    expect(res.dropped).toBe(true);
    expect(fetchPage).toHaveBeenCalledTimes(4);
  });
});

describe('shouldMarkOutOfStock', () => {
  it('marks out of stock when availableQty is 0 and price is usable', () => {
    expect(shouldMarkOutOfStock({ price: 4107.19, availableQty: 0 })).toBe(true);
  });

  it('does NOT mark when the product is in stock (delete is left to the next crawl)', () => {
    expect(shouldMarkOutOfStock({ price: 4107.19, availableQty: 3 })).toBe(false);
  });

  it('does NOT mark a delisted product (null offer)', () => {
    expect(shouldMarkOutOfStock(null)).toBe(false);
  });

  it('does NOT mark when the price is not usable (0 or negative)', () => {
    expect(shouldMarkOutOfStock({ price: 0, availableQty: 0 })).toBe(false);
    expect(shouldMarkOutOfStock({ price: -1, availableQty: 0 })).toBe(false);
  });
});
