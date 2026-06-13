/**
 * promos.repo.test.ts — Integration tests for makePromosRepo (Postgres + Prisma).
 *
 * Uses truncateAll() for isolation because replaceForSuper opens its own $transaction
 * (Prisma does not support nested interactive transactions — Option B from design).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testPrisma } from '../../../test/helpers/test-client.js';
import { truncateAll } from '../../../test/helpers/with-rollback.js';
import { makePromosRepo } from './promos.repo.js';

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  await testPrisma.$queryRaw`SELECT 1`;
});

// Defensive: clean before AND after each test so concurrent fork test files
// don't leave stale rows that corrupt our assertions.
beforeEach(async () => {
  await truncateAll();
});

afterEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('makePromosRepo', () => {
  describe('replaceForSuper', () => {
    it('inserts offers for a super', async () => {
      const repo = makePromosRepo(testPrisma);

      await repo.replaceForSuper(
        'carrefour',
        [
          {
            bank: 'Galicia',
            title: '20%',
            description: '20% de descuento los viernes',
            discountPct: 20,
            installments: null,
            interestFree: null,
            logoUrl: 'https://carrefour.com/galicia.png',
            imageUrl: null,
            validity: null,
          },
          {
            bank: 'Santander',
            title: '3 cuotas sin interés',
            description: '3 cuotas sin interés en todas las compras',
            discountPct: null,
            installments: 3,
            interestFree: true,
            logoUrl: 'https://carrefour.com/santander.png',
            imageUrl: null,
            validity: null,
          },
        ],
        'https://www.carrefour.com.ar/descuentos-bancarios',
      );

      const rows = await repo.listAll();
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.super === 'carrefour')).toBe(true);
    });

    it('replaces existing offers for the same super', async () => {
      const repo = makePromosRepo(testPrisma);

      await repo.replaceForSuper(
        'dia',
        [
          {
            bank: null,
            title: null,
            description: null,
            discountPct: null,
            installments: null,
            interestFree: null,
            logoUrl: null,
            imageUrl: 'https://dia.com/old-promo.jpg',
            validity: 'ONLINE',
          },
        ],
        'https://diaonline.supermercadosdia.com.ar/medios-de-pago-y-promociones',
      );

      await repo.replaceForSuper(
        'dia',
        [
          {
            bank: null,
            title: null,
            description: null,
            discountPct: null,
            installments: null,
            interestFree: null,
            logoUrl: null,
            imageUrl: 'https://dia.com/new-promo.jpg',
            validity: 'TIENDAS',
          },
        ],
        'https://diaonline.supermercadosdia.com.ar/medios-de-pago-y-promociones',
      );

      const rows = await repo.listAll();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.image_url).toBe('https://dia.com/new-promo.jpg');
    });

    it('does not affect offers from other supers', async () => {
      const repo = makePromosRepo(testPrisma);

      await repo.replaceForSuper(
        'vea',
        [{ bank: 'Macro', title: '15%', description: null, discountPct: 15, installments: null, interestFree: null, logoUrl: null, imageUrl: null, validity: null }],
        'https://www.vea.com.ar/descuentos-del-dia',
      );
      await repo.replaceForSuper(
        'masonline',
        [{ bank: 'Galicia', title: '10%', description: null, discountPct: 10, installments: null, interestFree: null, logoUrl: null, imageUrl: null, validity: null }],
        'https://www.masonline.com.ar/promociones-bancarias',
      );

      // Replace only vea
      await repo.replaceForSuper(
        'vea',
        [{ bank: 'Naranja X', title: '25%', description: null, discountPct: 25, installments: null, interestFree: null, logoUrl: null, imageUrl: null, validity: null }],
        'https://www.vea.com.ar/descuentos-del-dia',
      );

      const rows = await repo.listAll();
      const vea = rows.filter((r) => r.super === 'vea');
      const mas = rows.filter((r) => r.super === 'masonline');

      expect(vea).toHaveLength(1);
      expect(vea[0]?.bank).toBe('Naranja X');
      expect(mas).toHaveLength(1);
      expect(mas[0]?.bank).toBe('Galicia');
    });

    it('replaceForSuper with empty array clears all offers for that super', async () => {
      const repo = makePromosRepo(testPrisma);

      await repo.replaceForSuper(
        'masonline',
        [{ bank: 'Galicia', title: '10%', description: null, discountPct: 10, installments: null, interestFree: null, logoUrl: null, imageUrl: null, validity: null }],
        'https://www.masonline.com.ar/promociones-bancarias',
      );
      await repo.replaceForSuper('masonline', [], 'https://www.masonline.com.ar/promociones-bancarias');

      const rows = (await repo.listAll()).filter((r) => r.super === 'masonline');
      expect(rows).toHaveLength(0);
    });

    it('correctly stores and retrieves interest_free boolean', async () => {
      const repo = makePromosRepo(testPrisma);

      await repo.replaceForSuper(
        'carrefour',
        [
          { bank: 'Galicia', title: '3 cuotas', description: null, discountPct: null, installments: 3, interestFree: true, logoUrl: null, imageUrl: null, validity: null },
          { bank: 'Santander', title: '6 cuotas', description: null, discountPct: null, installments: 6, interestFree: false, logoUrl: null, imageUrl: null, validity: null },
          { bank: 'Macro', title: '20%', description: null, discountPct: 20, installments: null, interestFree: null, logoUrl: null, imageUrl: null, validity: null },
        ],
        'https://www.carrefour.com.ar/descuentos-bancarios',
      );

      const rows = await repo.listAll();
      expect(rows).toHaveLength(3);

      const galicia = rows.find((r) => r.bank === 'Galicia');
      expect(galicia?.interest_free).toBe(1); // API contract: 1 for true

      const santander = rows.find((r) => r.bank === 'Santander');
      expect(santander?.interest_free).toBe(0); // API contract: 0 for false

      const macro = rows.find((r) => r.bank === 'Macro');
      expect(macro?.interest_free).toBeNull();
    });
  });

  describe('listAll ordering', () => {
    it('orders by super ASC, discount_pct DESC NULLS LAST', async () => {
      const repo = makePromosRepo(testPrisma);

      await repo.replaceForSuper(
        'vea',
        [
          { bank: 'Macro', title: '10%', description: null, discountPct: 10, installments: null, interestFree: null, logoUrl: null, imageUrl: null, validity: null },
          { bank: 'Galicia', title: '30%', description: null, discountPct: 30, installments: null, interestFree: null, logoUrl: null, imageUrl: null, validity: null },
        ],
        'https://www.vea.com.ar/descuentos-del-dia',
      );
      await repo.replaceForSuper(
        'carrefour',
        [{ bank: 'Santander', title: '20%', description: null, discountPct: 20, installments: null, interestFree: null, logoUrl: null, imageUrl: null, validity: null }],
        'https://www.carrefour.com.ar/descuentos-bancarios',
      );

      const rows = await repo.listAll();

      // carrefour < vea alphabetically
      expect(rows[0]?.super).toBe('carrefour');
      // vea rows: 30% before 10%
      const veaRows = rows.filter((r) => r.super === 'vea');
      expect(veaRows[0]?.discount_pct).toBe(30);
      expect(veaRows[1]?.discount_pct).toBe(10);
    });

    it('returns all fields correctly', async () => {
      const repo = makePromosRepo(testPrisma);

      await repo.replaceForSuper(
        'dia',
        [
          {
            bank: null,
            title: null,
            description: null,
            discountPct: null,
            installments: null,
            interestFree: null,
            logoUrl: null,
            imageUrl: 'https://dia.com/promo-img.jpg',
            validity: 'ONLINE, TIENDAS',
          },
        ],
        'https://diaonline.supermercadosdia.com.ar/medios-de-pago-y-promociones',
      );

      const rows = await repo.listAll();
      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row).toBeDefined();
      expect(row?.id).toBeTypeOf('number');
      expect(row?.super).toBe('dia');
      expect(row?.image_url).toBe('https://dia.com/promo-img.jpg');
      expect(row?.validity).toBe('ONLINE, TIENDAS');
      expect(row?.source_url).toBe(
        'https://diaonline.supermercadosdia.com.ar/medios-de-pago-y-promociones',
      );
      expect(row?.captured_at).toBeTypeOf('number');
    });
  });
});
