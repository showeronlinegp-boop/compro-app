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
const carrefourCfg = { baseUrl: 'https://www.carrefour.com.ar', trustListPrice: true };
const diaCfg = { baseUrl: 'https://diaonline.supermercadosdia.com.ar', trustListPrice: true };

// Helper: build a minimal IS product carrying a single teaser. Price === PWD so the
// unit-discount path stays silent and only the teaser-derived promotions are tested.
function makeProductWithTeaser(id: string, teaser: unknown): IsSearchProduct {
  return {
    productId: id,
    productName: `Producto ${id}`,
    productReference: null,
    linkText: `producto-${id}`,
    link: `/producto-${id}/p`,
    categories: ['/Bebidas/'],
    items: [
      {
        itemId: id,
        ean: `7790${id}`,
        images: [{ imageUrl: 'https://example.com/x.jpg' }],
        sellers: [
          {
            commertialOffer: {
              Price: 1000,
              ListPrice: 1000,
              PriceWithoutDiscount: 1000,
              AvailableQuantity: 100,
              teasers: [teaser],
            },
          },
        ],
      },
    ],
  } as IsSearchProduct;
}

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

    it('captures conditional teasers ("2do al 80%") into promotions without touching unit price', () => {
      const normalize = buildNormalizer(diaCfg);
      // Real DIA teaser shape: Price === PriceWithoutDiscount, so the unit-discount
      // path stays silent — the promo only lives in commertialOffer.teasers.
      const product = {
        productId: '308933',
        productName: 'Yogur Griego Natural Sin Endulzar Yogurísimo 300 Gr.',
        productReference: null,
        linkText: 'yogur-griego-natural-308933',
        link: '/yogur-griego-natural-308933/p',
        categories: ['/Frescos/Lácteos/'],
        items: [
          {
            itemId: '308933',
            ean: '7790040000000',
            images: [{ imageUrl: 'https://example.com/308933.jpg' }],
            sellers: [
              {
                commertialOffer: {
                  Price: 4635,
                  ListPrice: 4635,
                  PriceWithoutDiscount: 4635,
                  AvailableQuantity: 100,
                  teasers: [
                    {
                      name: '2do al 80%',
                      conditions: { minimumQuantity: 2 },
                      effects: { parameters: [{ name: 'PercentualDiscount', value: '80' }] },
                    },
                  ],
                },
              },
            ],
          },
        ],
      } as IsSearchProduct;

      const result = normalize(product);
      expect(result).not.toBeNull();
      // Unit price stays honest — no fake discount.
      expect(result?.raw_price).toBe(4635);
      expect(result?.offer_price).toBeNull();
      expect(result?.discount_pct).toBe(0);
      // The conditional promo is surfaced separately.
      expect(result?.promotions).toEqual([
        { label: '2do al 80%', type: 'nth_unit', min_qty: 2, discount_pct: 80 },
      ]);
    });

    it('uses the per-Nth-unit discount from the label, not the inconsistent PercentualDiscount field (carrefour)', () => {
      const normalize = buildNormalizer(diaCfg);
      // Real carrefour teaser: label states "2do al 50%" but PercentualDiscount is the
      // averaged effective discount (25). Stored raw (25), the per-unit price came out
      // wrong (12.5% off instead of 25%). The label's "al 50%" is the truth — and the
      // trailing "AL 16.6" (no % sign) must NOT be picked up.
      const product = {
        productId: 'cc-zero',
        productName: 'Coca-cola Zero 2,25 Lt',
        productReference: null,
        linkText: 'coca-cola-zero',
        link: '/coca-cola-zero/p',
        categories: ['/Bebidas/Gaseosas/'],
        items: [
          {
            itemId: 'cc-zero',
            ean: '7790000000000',
            images: [{ imageUrl: 'https://example.com/cc.jpg' }],
            sellers: [
              {
                commertialOffer: {
                  Price: 5650,
                  ListPrice: 5650,
                  PriceWithoutDiscount: 5650,
                  AvailableQuantity: 100,
                  teasers: [
                    {
                      name: 'PROMO-2do al 50% Max 48 unidades Combinable COCA COLA-Reg-2-50-AS9 AL 16.6',
                      conditions: { minimumQuantity: 2 },
                      effects: { parameters: [{ name: 'PercentualDiscount', value: '25' }] },
                    },
                  ],
                },
              },
            ],
          },
        ],
      } as IsSearchProduct;

      const result = normalize(product);
      expect(result?.promotions).toEqual([
        {
          label: 'PROMO-2do al 50% Max 48 unidades Combinable COCA COLA-Reg-2-50-AS9 AL 16.6',
          type: 'nth_unit',
          min_qty: 2,
          discount_pct: 50,
        },
      ]);
    });

    it('parses an "NxM" promo ("3x2") to the equivalent (N-M)*100 per-unit discount, not the effective field value', () => {
      const normalize = buildNormalizer(diaCfg);
      // Real carrefour teaser: label "3x2" but PercentualDiscount carries the averaged
      // effective discount (33.33). The freed unit is 100% off ("Reg-3-100"), so the
      // per-unit formula needs pct=100 (n=3) → base * 2/3. The trailing date "al 14/6"
      // must NOT be picked up by the "al X%" branch.
      const teaser = {
        name: 'PROMO-Exclusivo online 3x2 Iguales-Reg-3-100-Mondelez8/6 al 14/6',
        conditions: { minimumQuantity: 3 },
        effects: { parameters: [{ name: 'PercentualDiscount', value: '33.33' }] },
      };
      const result = normalize(makeProductWithTeaser('3x2', teaser));
      expect(result?.promotions).toEqual([
        {
          label: 'PROMO-Exclusivo online 3x2 Iguales-Reg-3-100-Mondelez8/6 al 14/6',
          type: 'nth_unit',
          min_qty: 3,
          discount_pct: 100,
        },
      ]);
    });

    it('parses "2x1" to a 100% per-unit discount (one free unit), ignoring the field', () => {
      const normalize = buildNormalizer(diaCfg);
      const teaser = {
        name: '2x1',
        conditions: { minimumQuantity: 2 },
        effects: { parameters: [{ name: 'PercentualDiscount', value: '50' }] },
      };
      const result = normalize(makeProductWithTeaser('2x1', teaser));
      expect(result?.promotions).toEqual([
        { label: '2x1', type: 'nth_unit', min_qty: 2, discount_pct: 100 },
      ]);
    });

    it('falls back to PercentualDiscount when the label has neither "NxM" nor "al X%"', () => {
      const normalize = buildNormalizer(diaCfg);
      const teaser = {
        name: 'Combo Mondelez especial',
        conditions: { minimumQuantity: 2 },
        effects: { parameters: [{ name: 'PercentualDiscount', value: '20' }] },
      };
      const result = normalize(makeProductWithTeaser('combo', teaser));
      expect(result?.promotions).toEqual([
        { label: 'Combo Mondelez especial', type: 'nth_unit', min_qty: 2, discount_pct: 20 },
      ]);
    });

    it('classifies an unconditional promo (minimumQuantity 0) as "other", not "nth_unit"', () => {
      const normalize = buildNormalizer(diaCfg);
      // Carrefour payment/card discount: applies per unit, no quantity threshold.
      // It must NOT be tagged nth_unit (which implies a "buy N, Nth at X%" calc).
      const product = {
        productId: 'card',
        productName: 'Producto con descuento de tarjeta',
        productReference: null,
        linkText: 'producto-card',
        link: '/producto-card/p',
        categories: ['/Bebidas/'],
        items: [
          {
            itemId: 'card',
            ean: '7790000000002',
            images: [{ imageUrl: 'https://example.com/c.jpg' }],
            sellers: [
              {
                commertialOffer: {
                  Price: 1000,
                  ListPrice: 1000,
                  PriceWithoutDiscount: 1000,
                  AvailableQuantity: 100,
                  teasers: [
                    {
                      name: 'Tarjeta Carrefour 15%',
                      conditions: { minimumQuantity: 0 },
                      effects: { parameters: [{ name: 'PercentualDiscount', value: '15' }] },
                    },
                  ],
                },
              },
            ],
          },
        ],
      } as IsSearchProduct;

      const result = normalize(product);
      expect(result?.promotions).toEqual([
        { label: 'Tarjeta Carrefour 15%', type: 'other', min_qty: null, discount_pct: 15 },
      ]);
    });

    it('trustListPrice: detects discount from ListPrice when PWD === Price', () => {
      const normalize = buildNormalizer(diaCfg);
      const product = {
        productId: '1',
        productName: 'Arroz Largo Fino Test',
        productReference: null,
        linkText: 'arroz-1',
        link: '/arroz-1/p',
        categories: ['/Almacén/'],
        items: [
          {
            itemId: '1',
            ean: null,
            images: [],
            sellers: [
              {
                commertialOffer: {
                  Price: 1575,
                  ListPrice: 1970,
                  PriceWithoutDiscount: 1575, // === Price → primary signal silent
                  AvailableQuantity: 10,
                },
              },
            ],
          },
        ],
      } as IsSearchProduct;

      const result = normalize(product);
      expect(result?.discount_pct).toBe(20); // (1970-1575)/1970
      expect(result?.raw_price).toBe(1970); // strike-through = ListPrice
      expect(result?.offer_price).toBe(1575);
    });
  });

  describe('trustListPrice guards', () => {
    it("OFF (vea): ListPrice is ignored even when it implies a discount", () => {
      const normalize = buildNormalizer(veaCfg); // no trustListPrice
      const product = {
        productId: '1',
        productName: 'Aceite Test',
        productReference: null,
        linkText: 'aceite-1',
        link: '/aceite-1/p',
        categories: [],
        items: [
          {
            itemId: '1',
            ean: null,
            images: [],
            sellers: [
              {
                commertialOffer: {
                  Price: 6389,
                  ListPrice: 528017, // stale garbage
                  PriceWithoutDiscount: 6389,
                  AvailableQuantity: 10,
                },
              },
            ],
          },
        ],
      } as IsSearchProduct;

      const result = normalize(product);
      expect(result?.discount_pct).toBe(0);
      expect(result?.raw_price).toBe(6389);
      expect(result?.offer_price).toBeNull();
    });

    it('ON but DISCOUNT_CAP rejects a >80% ListPrice gap (safety net)', () => {
      const normalize = buildNormalizer(diaCfg); // trustListPrice ON
      const product = {
        productId: '1',
        productName: 'Garbage ListPrice Test',
        productReference: null,
        linkText: 'g-1',
        link: '/g-1/p',
        categories: [],
        items: [
          {
            itemId: '1',
            ean: null,
            images: [],
            sellers: [
              {
                commertialOffer: {
                  Price: 6389,
                  ListPrice: 528017, // 99% gap → above cap → rejected
                  PriceWithoutDiscount: 6389,
                  AvailableQuantity: 10,
                },
              },
            ],
          },
        ],
      } as IsSearchProduct;

      const result = normalize(product);
      expect(result?.discount_pct).toBe(0);
      expect(result?.offer_price).toBeNull();
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
