/**
 * sync.repo.test.ts — DB-backed tests for the out-of-stock rescue helpers:
 * getStaleProducts (rows not seen in the current sync) and markOutOfStock
 * (keep visible with current price, drop promo, bump synced_at).
 */
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { withRollback } from '../../test/helpers/with-rollback.js';
import { makeSyncRepo } from './sync.repo.js';

const STARTED_AT = new Date('2026-06-28T12:00:00Z');
const BEFORE = new Date('2026-06-27T12:00:00Z'); // not seen this run → stale
const AFTER = new Date('2026-06-28T12:30:00Z'); // upserted this run → fresh

describe('syncRepo out-of-stock rescue', () => {
  it('getStaleProducts returns only rows synced before the run started, for that super', async () => {
    await withRollback(async (tx) => {
      const repo = makeSyncRepo(tx as unknown as PrismaClient);
      const log = await tx.sync_log.create({
        data: { super: 'vea', started_at: STARTED_AT, status: 'running', progress_leaf: 0, total_leaves: 0 },
      });

      const stale = await tx.products.create({
        data: { super: 'vea', product_id: '413060', name: 'OOS', synced_at: BEFORE },
      });
      await tx.products.create({
        data: { super: 'vea', product_id: 'fresh', name: 'Fresh', synced_at: AFTER },
      });
      // Same timing but a DIFFERENT super must be ignored by the super-scoped query.
      await tx.products.create({
        data: { super: 'dia', product_id: 'other', name: 'Other super', synced_at: BEFORE },
      });

      const result = await repo.getStaleProducts('vea', log.id);
      expect(result).toEqual([{ id: stale.id, product_id: '413060' }]);
    });
  });

  it('markOutOfStock keeps the row visible with the current price and clears the promo', async () => {
    await withRollback(async (tx) => {
      const repo = makeSyncRepo(tx as unknown as PrismaClient);
      const p = await tx.products.create({
        data: {
          super: 'vea',
          product_id: '413060',
          name: 'Tapas',
          available: true,
          raw_price: 2725,
          offer_price: 1689.5,
          discount_pct: 38,
          promotions: [{ label: '2do al 70%', type: 'nth_unit', min_qty: 2, discount_pct: 70 }],
          synced_at: BEFORE,
        },
      });

      await repo.markOutOfStock(p.id, 4107.19);

      const updated = await tx.products.findUniqueOrThrow({ where: { id: p.id } });
      expect(updated.available).toBe(false);
      expect(updated.raw_price).toBe(4107.19);
      expect(updated.offer_price).toBeNull();
      expect(updated.discount_pct).toBe(0);
      expect(updated.promotions).toEqual([]);
      // synced_at bumped past the previous value so the stale-delete won't remove it.
      expect(updated.synced_at.getTime()).toBeGreaterThan(BEFORE.getTime());
    });
  });
});
