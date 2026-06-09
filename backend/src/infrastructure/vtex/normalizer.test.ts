/**
 * normalizer.test.ts — Characterization test (Task 4.7 baseline, Task 5.9 re-pointed to TS)
 *
 * Now tests the TS port: buildNormalizer() from infrastructure/vtex/normalizer.ts.
 * The snapshots were generated from the LEGACY JS and MUST match byte-identical.
 *
 * Strategy:
 *   - Import the TS buildNormalizer directly (pure function — no CJS interop needed).
 *   - Use the same fixture data as the baseline.
 *   - Run the same assertions. Snapshots MUST NOT require regeneration.
 */

import { describe, expect, it } from 'vitest';

import carrefourPage1 from './__fixtures__/is-search-carrefour-category-1-Electro-y-tecnolog-a-p1.json' with {
  type: 'json',
};
import diaPage1 from './__fixtures__/is-search-dia-category-1-Almac-n-p1.json' with {
  type: 'json',
};
// ── fixtures ──────────────────────────────────────────────────────────────────
import veaPage1 from './__fixtures__/is-search-vea-category-1-Almac-n-p1.json' with {
  type: 'json',
};

import type { IsSearchProduct } from './is-client.js';
// ── TS port: import directly (no CJS interop needed) ─────────────────────────
import { buildNormalizer } from './normalizer.js';

const veaCfg = { baseUrl: 'https://www.vea.com.ar', promoSeller: 'jumboargentinav700cordoba700' };
const carrefourCfg = { baseUrl: 'https://www.carrefour.com.ar' };
const diaCfg = { baseUrl: 'https://diaonline.supermercadosdia.com.ar' };

// ─────────────────────────────────────────────────────────────────────────────

describe('TS buildNormalizer — characterization (must match LEGACY snapshots)', () => {
  describe('vea — Almacén page 1', () => {
    const normalize = buildNormalizer(veaCfg);

    it('normalizes first product (snapshot)', () => {
      const p = veaPage1.products[0] as IsSearchProduct;
      expect(normalize(p)).toMatchSnapshot();
    });

    it('normalizes all 100 products — no null for available products', () => {
      const normalize_ = buildNormalizer(veaCfg);
      const results = (veaPage1.products as IsSearchProduct[]).map((p) => normalize_(p));
      const nullCount = results.filter((r) => r === null).length;
      expect(nullCount).toBe(0);
    });

    it('snapshot first 5 products', () => {
      const normalize_ = buildNormalizer(veaCfg);
      const results = (veaPage1.products as IsSearchProduct[])
        .slice(0, 5)
        .map((p) => normalize_(p));
      expect(results).toMatchSnapshot();
    });

    it('category_paths strips leading/trailing slashes and replaces inner / with " > "', () => {
      const normalize_ = buildNormalizer(veaCfg);
      const result = normalize_(veaPage1.products[0] as IsSearchProduct) as {
        category_paths: string[];
      } | null;
      expect(result).not.toBeNull();
      expect(result?.category_paths).toMatchSnapshot();
    });
  });

  describe('carrefour — Electro page 1', () => {
    it('normalizes first 5 products (snapshot)', () => {
      const normalize = buildNormalizer(carrefourCfg);
      const results = (carrefourPage1.products as IsSearchProduct[])
        .slice(0, 5)
        .map((p) => normalize(p));
      expect(results).toMatchSnapshot();
    });
  });

  describe('dia — Almacén page 1', () => {
    it('normalizes first 5 products (snapshot)', () => {
      const normalize = buildNormalizer(diaCfg);
      const results = (diaPage1.products as IsSearchProduct[]).slice(0, 5).map((p) => normalize(p));
      expect(results).toMatchSnapshot();
    });

    it('discount product: PriceWithoutDiscount > Price triggers hasDiscount (snapshot)', () => {
      const normalize = buildNormalizer(diaCfg);
      const maggi = (diaPage1.products as IsSearchProduct[]).find((p) =>
        p.productName.includes('Maggi'),
      );
      if (!maggi) throw new Error('Maggi product not found in fixture');
      const result = normalize(maggi) as {
        raw_price: number;
        offer_price: number | null;
        discount_pct: number;
      } | null;
      expect(result).not.toBeNull();
      expect(result?.raw_price).toBe(6799);
      expect(result?.offer_price).toBe(4079.4);
      expect(result?.discount_pct).toBe(40);
      expect(result).toMatchSnapshot();
    });
  });

  describe('AvailableQuantity=0 skip', () => {
    it('returns null for a product with AvailableQuantity=0', () => {
      const normalize = buildNormalizer(veaCfg);
      const zeroAvailProduct: IsSearchProduct = {
        productId: '99999',
        productName: 'Zero Avail Product',
        productReference: null,
        linkText: 'zero-avail',
        link: '/zero-avail/p',
        categories: ['/Almacén/'],
        items: [
          {
            itemId: '999991',
            ean: '0000000000000',
            images: [],
            sellers: [
              {
                commertialOffer: {
                  Price: 100,
                  ListPrice: 100,
                  PriceWithoutDiscount: 100,
                  AvailableQuantity: 0,
                },
              },
            ],
          },
        ],
      };
      expect(normalize(zeroAvailProduct)).toBeNull();
    });
  });

  describe('discount guard — 80% cap', () => {
    it('rejects discount > 80% as stale PriceWithoutDiscount', () => {
      const normalize = buildNormalizer(veaCfg);
      const staleProduct: IsSearchProduct = {
        productId: '88888',
        productName: 'Stale Price Product',
        productReference: null,
        linkText: 'stale-product',
        link: '/stale-product/p',
        categories: ['/Almacén/'],
        items: [
          {
            itemId: '888881',
            ean: '1111111111111',
            images: [],
            sellers: [
              {
                commertialOffer: {
                  Price: 1000,
                  ListPrice: 200000,
                  PriceWithoutDiscount: 200000,
                  AvailableQuantity: 10,
                },
              },
            ],
          },
        ],
      };
      const result = normalize(staleProduct) as {
        raw_price: number | null;
        offer_price: number | null;
        discount_pct: number;
      } | null;
      expect(result).not.toBeNull();
      expect(result?.offer_price).toBeNull();
      expect(result?.discount_pct).toBe(0);
      expect(result?.raw_price).toBe(1000);
    });

    it('accepts discount exactly at 80% boundary', () => {
      const normalize = buildNormalizer(veaCfg);
      const product80pct: IsSearchProduct = {
        productId: '77777',
        productName: 'Exactly 80 Product',
        productReference: null,
        linkText: 'exactly-80',
        link: '/exactly-80/p',
        categories: ['/Almacén/'],
        items: [
          {
            itemId: '777771',
            ean: '2222222222222',
            images: [],
            sellers: [
              {
                commertialOffer: {
                  Price: 200,
                  ListPrice: 1000,
                  PriceWithoutDiscount: 1000,
                  AvailableQuantity: 5,
                },
              },
            ],
          },
        ],
      };
      const result = normalize(product80pct) as {
        raw_price: number | null;
        offer_price: number | null;
        discount_pct: number;
      } | null;
      expect(result).not.toBeNull();
      expect(result?.discount_pct).toBe(80);
      expect(result?.offer_price).toBe(200);
      expect(result?.raw_price).toBe(1000);
    });
  });
});
