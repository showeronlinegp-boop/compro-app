/**
 * is-client.test.ts — unit tests for parseProductOffer, the pure parser behind
 * fetchProductOffer (out-of-stock rescue). No network is hit.
 */
import { describe, expect, it } from 'vitest';
import { parseProductOffer, regionSegmentCookie } from './is-client.js';

function product(offer: { Price?: number; AvailableQuantity?: number }) {
  return [{ items: [{ sellers: [{ commertialOffer: offer }] }] }];
}

describe('parseProductOffer', () => {
  it('extracts price and availableQty from the first seller offer', () => {
    expect(parseProductOffer(product({ Price: 4107.19, AvailableQuantity: 0 }))).toEqual({
      price: 4107.19,
      availableQty: 0,
    });
  });

  it('reads a positive availability', () => {
    expect(parseProductOffer(product({ Price: 1689.5, AvailableQuantity: 5 }))).toEqual({
      price: 1689.5,
      availableQty: 5,
    });
  });

  it('defaults availableQty to 0 when missing', () => {
    expect(parseProductOffer(product({ Price: 999 }))).toEqual({ price: 999, availableQty: 0 });
  });

  it('returns null for an empty response (delisted product)', () => {
    expect(parseProductOffer([])).toBeNull();
  });

  it('returns null when there is no usable price', () => {
    expect(parseProductOffer(product({ AvailableQuantity: 0 }))).toBeNull();
    expect(parseProductOffer([{ items: [] }])).toBeNull();
  });
});

describe('regionSegmentCookie', () => {
  it('encodes the regionId into a base64 vtex_segment cookie', () => {
    const regionId = 'U1cjanVtYm9hcmdlbnRpbmF2NjY5cGVyZ2FtaW5v';
    const cookie = regionSegmentCookie(regionId);
    expect(cookie.startsWith('vtex_segment=')).toBe(true);
    const b64 = cookie.slice('vtex_segment='.length);
    expect(JSON.parse(Buffer.from(b64, 'base64').toString())).toEqual({ regionId });
  });
});
