import { describe, expect, it } from 'vitest';
import { resolveStoreUrl } from './supers';

describe('resolveStoreUrl', () => {
  it('prefixes the super storefront origin onto a relative product_url', () => {
    // This is the bug: a relative "/slug/p" rendered as-is resolves against our
    // own app origin instead of the super's site.
    expect(resolveStoreUrl('/limpiador-multimax-cherry-1/p', 'vea')).toBe(
      'https://www.vea.com.ar/limpiador-multimax-cherry-1/p',
    );
  });

  it('handles a relative path with no leading slash', () => {
    expect(resolveStoreUrl('slug/p', 'dia')).toBe(
      'https://diaonline.supermercadosdia.com.ar/slug/p',
    );
  });

  it('leaves an already-absolute URL unchanged (http/https)', () => {
    const abs = 'https://www.carrefour.com.ar/algun-producto/p';
    expect(resolveStoreUrl(abs, 'carrefour')).toBe(abs);
    expect(resolveStoreUrl('http://www.masonline.com.ar/x/p', 'masonline')).toBe(
      'http://www.masonline.com.ar/x/p',
    );
  });

  it('returns null when there is no product_url', () => {
    expect(resolveStoreUrl(null, 'vea')).toBeNull();
    expect(resolveStoreUrl(undefined, 'vea')).toBeNull();
    expect(resolveStoreUrl('', 'vea')).toBeNull();
  });

  it('returns null for an unknown super with no storefront base', () => {
    expect(resolveStoreUrl('/x/p', 'desconocido')).toBeNull();
  });
});
