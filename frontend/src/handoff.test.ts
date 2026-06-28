/**
 * Unit tests for buildHandoffUrl — pure VTEX cart-add deep-link builder.
 * Covers SC-4.1 through SC-4.8 plus edge cases.
 *
 * W2 note: buildHandoffUrl ALWAYS returns a HandoffResult object (never bare null).
 * `result.url` is null when zero items are linkable; `included` and `total` are
 * always populated so callers can render transparency counts unconditionally.
 */

import { describe, expect, it } from 'vitest';
import { buildHandoffUrl } from './handoff';

const BASE = 'https://www.carrefour.com.ar';

describe('buildHandoffUrl', () => {
  // SC-4.1: happy path — all sku_ids present
  it('SC-4.1: returns correct URL for 2 items, included===total===2, truncated=false', () => {
    const result = buildHandoffUrl(BASE, [
      { sku_id: '123', qty: 2 },
      { sku_id: '456', qty: 1 },
    ]);

    expect(result.url).toBe(
      `${BASE}/checkout/cart/add?sku=123&qty=2&seller=1&sc=1&sku=456&qty=1&seller=1&sc=1`,
    );
    expect(result.included).toBe(2);
    expect(result.total).toBe(2);
    expect(result.truncated).toBe(false);
  });

  // SC-4.2: mixed null sku_ids — skips nulls, counts both in total
  it('SC-4.2: skips null sku_id, included=1, total=2, url non-null', () => {
    const result = buildHandoffUrl(BASE, [
      { sku_id: '123', qty: 1 },
      { sku_id: null, qty: 3 },
    ]);

    expect(result.url).not.toBeNull();
    expect(result.url).toContain('sku=123');
    expect(result.included).toBe(1);
    expect(result.total).toBe(2);
  });

  // SC-4.3: all null skus → url is null, counts preserved (W2)
  it('SC-4.3: all null skus → url===null, included===0, total===2', () => {
    const result = buildHandoffUrl(BASE, [
      { sku_id: null, qty: 1 },
      { sku_id: null, qty: 2 },
    ]);

    expect(result.url).toBeNull();
    expect(result.included).toBe(0);
    expect(result.total).toBe(2);
    expect(result.truncated).toBe(false);
  });

  // SC-4.4: single item — correct query string shape
  it('SC-4.4: single item URL ends with ?sku=999&qty=5&seller=1&sc=1', () => {
    const result = buildHandoffUrl(BASE, [{ sku_id: '999', qty: 5 }]);

    expect(result.url).toBe(`${BASE}/checkout/cart/add?sku=999&qty=5&seller=1&sc=1`);
    expect(result.included).toBe(1);
  });

  // SC-4.5: URL length guard triggers — enough items to exceed 2000 chars
  it('SC-4.5: URL-length guard fires, truncated=true, url non-null, URL≤2000', () => {
    // Each item contributes roughly 40 chars (?sku=SKU-xxxxxxxxxxxxxxxx&qty=1&seller=1&sc=1).
    // 60 items × ~40 chars = 2400 chars total. Use a 21-char sku to guarantee overflow.
    const longSku = 'SKUXXXXXXXXXXXXXXXX01'; // 21 chars
    const items = Array.from({ length: 60 }, (_, i) => ({
      sku_id: `${longSku}${String(i).padStart(2, '0')}`,
      qty: 1,
    }));

    const result = buildHandoffUrl(BASE, items);

    expect(result.url).not.toBeNull();
    expect(result.truncated).toBe(true);
    expect(result.included).toBeGreaterThanOrEqual(1);
    expect(result.included).toBeLessThan(result.total);
    expect(result.total).toBe(60);
    // url is non-null here — safe to assert length
    expect((result.url as string).length).toBeLessThanOrEqual(2000);
  });

  // SC-4.6: qty=0 → clamped to 1
  it('SC-4.6: qty=0 is clamped to 1 in the URL', () => {
    const result = buildHandoffUrl(BASE, [{ sku_id: '77', qty: 0 }]);

    expect(result.url).not.toBeNull();
    expect(result.url).toContain('qty=1');
    expect(result.url).not.toContain('qty=0');
  });

  // SC-4.7: sku with special characters → encodeURIComponent applied
  it('SC-4.7: sku_id with special chars is URI-encoded', () => {
    const result = buildHandoffUrl(BASE, [{ sku_id: 'sku 1&2', qty: 1 }]);

    expect(result.url).not.toBeNull();
    // Encoded: space → %20, & → %26
    expect(result.url).toContain('sku=sku%201%262');
    // Raw space or & must not appear inside the sku value
    expect(result.url).not.toMatch(/sku=sku 1/);
  });

  // SC-4.8: empty items array → url null, counts zero (W2)
  it('SC-4.8: empty items array → url===null, included===0, total===0', () => {
    const result = buildHandoffUrl(BASE, []);

    expect(result.url).toBeNull();
    expect(result.included).toBe(0);
    expect(result.total).toBe(0);
  });

  // Extra: empty checkoutBaseUrl → url null, counts zero (W2)
  it('empty checkoutBaseUrl → url===null, included===0', () => {
    const result = buildHandoffUrl('', [{ sku_id: '123', qty: 1 }]);

    expect(result.url).toBeNull();
    expect(result.included).toBe(0);
    expect(result.total).toBe(1); // total still reflects the input
  });

  // Extra: seller=1&sc=1 appears exactly once per item pair (not once globally)
  it('seller=1&sc=1 appears once per item, not once globally', () => {
    const result = buildHandoffUrl(BASE, [
      { sku_id: 'A', qty: 1 },
      { sku_id: 'B', qty: 2 },
    ]);

    expect(result.url).not.toBeNull();
    const url = result.url as string;
    const sellerCount = (url.match(/seller=1/g) ?? []).length;
    const scCount = (url.match(/sc=1/g) ?? []).length;
    expect(sellerCount).toBe(2);
    expect(scCount).toBe(2);
  });

  // Extra: negative qty is clamped to 1
  it('negative qty is clamped to 1', () => {
    const result = buildHandoffUrl(BASE, [{ sku_id: 'X', qty: -5 }]);

    expect(result.url).not.toBeNull();
    expect(result.url).toContain('qty=1');
  });

  // Extra: fractional qty is floored then clamped
  it('fractional qty 1.9 floors to 1', () => {
    const result = buildHandoffUrl(BASE, [{ sku_id: 'Y', qty: 1.9 }]);

    expect(result.url).not.toBeNull();
    expect(result.url).toContain('qty=1');
  });
});
