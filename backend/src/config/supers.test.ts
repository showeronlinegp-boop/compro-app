/**
 * supers.test.ts — Unit tests for resolveEnrichStrategy.
 *
 * Verifies:
 *   - carrefour → 'none'       (explicit config wins)
 *   - vea       → 'promotions' (derived from promoSeller)
 *   - dia       → 'jsonld'     (no promoSeller, no explicit override)
 *   - masonline → 'simulation' (explicit override — its promos live only in checkout sim)
 *   - explicit enrichStrategy override always wins over the derived default
 */

import { describe, expect, it } from 'vitest';
import { resolveEnrichStrategy } from './supers.js';

describe('resolveEnrichStrategy', () => {
  it('carrefour → none (explicit enrichStrategy wins)', () => {
    expect(resolveEnrichStrategy('carrefour')).toBe('none');
  });

  it('vea → promotions (derived from promoSeller)', () => {
    expect(resolveEnrichStrategy('vea')).toBe('promotions');
  });

  it('dia → jsonld (no promoSeller, no explicit override)', () => {
    expect(resolveEnrichStrategy('dia')).toBe('jsonld');
  });

  it('masonline → simulation (explicit override)', () => {
    expect(resolveEnrichStrategy('masonline')).toBe('simulation');
  });

  it('unknown super key → jsonld (safe fallback, no config found)', () => {
    // A super that is not in SUPERS returns undefined cfg → no promoSeller → 'jsonld'.
    // This ensures we never throw on an unexpected key.
    expect(resolveEnrichStrategy('unknown-super')).toBe('jsonld');
  });
});
