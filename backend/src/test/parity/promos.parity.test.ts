/**
 * promos.parity.test.ts — B7.3 Promos parity tests.
 *
 * Tests spec scenarios:
 *   - replaceForSuper is atomic (no partial state visible)
 *   - NULLS LAST ordering for discount_pct
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testPrisma } from '../helpers/test-client.js';
import { truncateAll } from '../helpers/with-rollback.js';
import { makePromosRepo } from '../../modules/promos/infrastructure/promos.repo.js';

beforeAll(async () => {
  await testPrisma.$queryRaw`SELECT 1`;
});

beforeEach(async () => {
  await truncateAll();
});

afterEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe('Promos parity: atomic replace + NULLS LAST ordering', () => {
  it('replaceForSuper is atomic: no partial state after full replace', async () => {
    const repo = makePromosRepo(testPrisma);

    // Insert initial offers
    await repo.replaceForSuper(
      'carrefour',
      [
        { bank: 'Old Bank', title: 'Old', description: null, discountPct: 10, installments: null, interestFree: null, logoUrl: null, imageUrl: null, validity: null },
        { bank: 'Old Bank 2', title: 'Old 2', description: null, discountPct: 20, installments: null, interestFree: null, logoUrl: null, imageUrl: null, validity: null },
      ],
      'https://carrefour.com',
    );

    // Replace with exactly 1 new offer
    await repo.replaceForSuper(
      'carrefour',
      [
        { bank: 'New Bank', title: 'New Offer', description: null, discountPct: 30, installments: null, interestFree: null, logoUrl: null, imageUrl: null, validity: null },
      ],
      'https://carrefour.com',
    );

    const rows = await repo.listAll();
    const carrefour = rows.filter((r) => r.super === 'carrefour');
    // Exactly 1 row — old rows fully deleted, new row inserted
    expect(carrefour).toHaveLength(1);
    expect(carrefour[0]?.bank).toBe('New Bank');
    expect(carrefour[0]?.discount_pct).toBe(30);
  });

  it('NULLS LAST: offers with null discount_pct appear after those with values', async () => {
    const repo = makePromosRepo(testPrisma);

    await repo.replaceForSuper(
      'vea',
      [
        { bank: 'A', title: null, description: null, discountPct: null, installments: 3, interestFree: true, logoUrl: null, imageUrl: null, validity: null },
        { bank: 'B', title: null, description: null, discountPct: 20, installments: null, interestFree: null, logoUrl: null, imageUrl: null, validity: null },
        { bank: 'C', title: null, description: null, discountPct: 10, installments: null, interestFree: null, logoUrl: null, imageUrl: null, validity: null },
      ],
      'https://vea.com',
    );

    const rows = (await repo.listAll()).filter((r) => r.super === 'vea');
    expect(rows).toHaveLength(3);
    // B (20%) first, C (10%) second, A (null) last
    expect(rows[0]?.bank).toBe('B');
    expect(rows[0]?.discount_pct).toBe(20);
    expect(rows[1]?.bank).toBe('C');
    expect(rows[1]?.discount_pct).toBe(10);
    expect(rows[2]?.bank).toBe('A');
    expect(rows[2]?.discount_pct).toBeNull();
  });
});
