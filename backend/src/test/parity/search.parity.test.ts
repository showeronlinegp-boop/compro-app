/**
 * search.parity.test.ts — Parity tests for buildNameSearch + Postgres unaccent.
 *
 * Verifies that the SQL NORM expression (immutable_unaccent + regexp_replace + lower)
 * applied in Postgres produces equivalent search results to the normalizeSearchText()
 * JS function. Run against the real Postgres test DB.
 *
 * These are B7.1 spec parity tests from the SDD tasks.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testPrisma } from '../helpers/test-client.js';
import { withRollback } from '../helpers/with-rollback.js';
import { makeCatalogRepo } from '../../modules/catalog/infrastructure/catalog.repo.js';

beforeAll(async () => {
  await testPrisma.$queryRaw`SELECT 1`;
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

async function seedProduct(
  tx: Parameters<Parameters<typeof testPrisma.$transaction>[0]>[0],
  name: string,
  productId?: string,
): Promise<number> {
  const result = await tx.products.create({
    data: {
      super: 'vea',
      product_id: productId ?? `pid-${Date.now()}-${Math.random()}`,
      name,
      available: true,
      categories: [],
    },
  });
  return result.id;
}

describe('Search parity: Postgres immutable_unaccent vs normalizeSearchText()', () => {
  it('accent-insensitive search finds product (Taragüi → taragui)', async () => {
    await withRollback(async (tx) => {
      await seedProduct(tx, 'Yerba Mate Taragüi', 'pTaragui');
      const repo = makeCatalogRepo(tx);
      const result = await repo.search({ q: 'taragui' });
      expect(result.total).toBe(1);
      expect(result.data[0]?.name).toBe('Yerba Mate Taragüi');
    });
  });

  it('mixed-case + accent search finds product (Serenísima → serenisima)', async () => {
    await withRollback(async (tx) => {
      await seedProduct(tx, 'Leche SERENÍSIMA Entera', 'pSeren');
      const repo = makeCatalogRepo(tx);
      const result = await repo.search({ q: 'serenisima entera' });
      expect(result.total).toBe(1);
      expect(result.data[0]?.name).toBe('Leche SERENÍSIMA Entera');
    });
  });

  it('punctuation in product name does not break token matching', async () => {
    await withRollback(async (tx) => {
      await seedProduct(tx, 'Agua S.Pellegrino 500ml', 'pPell');
      const repo = makeCatalogRepo(tx);
      const result = await repo.search({ q: 'pellegrino 500ml' });
      expect(result.total).toBe(1);
      expect(result.data[0]?.name).toBe('Agua S.Pellegrino 500ml');
    });
  });

  it('multi-token AND semantics: "jugo manzana" does not match "Jugo de Naranja"', async () => {
    await withRollback(async (tx) => {
      await seedProduct(tx, 'Jugo de Naranja', 'pNaranja');
      await seedProduct(tx, 'Jugo de Manzana', 'pManzana');
      const repo = makeCatalogRepo(tx);
      const result = await repo.search({ q: 'jugo manzana' });
      expect(result.total).toBe(1);
      expect(result.data[0]?.name).toBe('Jugo de Manzana');
    });
  });

  it('non-matching query returns empty results', async () => {
    await withRollback(async (tx) => {
      await seedProduct(tx, 'Leche Entera', 'pLeche');
      const repo = makeCatalogRepo(tx);
      const result = await repo.search({ q: 'xyzzy' });
      expect(result.total).toBe(0);
    });
  });

  it('Coca-Cola Zero (hyphen) found by "coca cola zero" (spaces)', async () => {
    await withRollback(async (tx) => {
      await seedProduct(tx, 'Gaseosa Coca-Cola Zero 2,5 Lt.', 'pCoca');
      const repo = makeCatalogRepo(tx);
      const result = await repo.search({ q: 'coca cola zero' });
      expect(result.total).toBe(1);
      expect(result.data[0]?.name).toBe('Gaseosa Coca-Cola Zero 2,5 Lt.');
    });
  });

  it('getGroups uses unaccent normalization (Taragüi found by taragui)', async () => {
    await withRollback(async (tx) => {
      await seedProduct(tx, 'Yerba Mate Taragüi', 'pTaraguiG');
      const repo = makeCatalogRepo(tx);
      const result = await repo.getGroups({ q: 'taragui' });
      expect(result.total).toBe(1);
      expect(result.data[0]?.name).toBe('Yerba Mate Taragüi');
    });
  });
});
