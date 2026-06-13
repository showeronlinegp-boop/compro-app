/**
 * sync.repo.ts — Database operations for the crawler sync workflow (Prisma/Postgres).
 *
 * Replaces the better-sqlite3 sync.repo. Key changes:
 *   - All methods are async (Prisma is async-only).
 *   - upsertProducts uses chunked interactive $transaction (~500/chunk) to bound
 *     transaction duration and avoid the 5s default Prisma timeout on large batches.
 *   - deleteStaleForSuper uses $executeRaw (cross-table correlated delete).
 *   - All sync_log operations use Prisma model delegates.
 */

import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { NormalizedCrawlItem, SyncLog } from '../../shared/types.js';

const UPSERT_CHUNK_SIZE = 500;

export interface SyncRepo {
  /** Upsert a batch of products for a given superKey (chunked transactions). */
  upsertProducts: (superKey: string, items: NormalizedCrawlItem[]) => Promise<void>;
  /** Delete rows for superKey that were last synced before the given sync started_at. */
  deleteStaleForSuper: (superKey: string, logId: number) => Promise<number>;
  /** Insert a new sync_log row and return its id. */
  insertSyncLog: (superKey: string) => Promise<number>;
  /** Update progress fields on an existing sync_log row. */
  updateSyncProgress: (
    progressLeaf: number,
    totalLeaves: number,
    productCount: number,
    logId: number,
  ) => Promise<void>;
  /** Mark a sync_log row as completed (ok). */
  finishSyncLog: (productCount: number, logId: number) => Promise<void>;
  /** Mark a sync_log row as failed (error). */
  failSyncLog: (errorMessage: string, logId: number) => Promise<void>;
  /** Return the latest sync_log row per super, ordered by super. */
  getSyncStatus: () => Promise<SyncLog[]>;
}

export function makeSyncRepo(prisma: PrismaClient): SyncRepo {
  return {
    async upsertProducts(superKey, items) {
      // Chunk into batches to bound transaction duration
      for (let start = 0; start < items.length; start += UPSERT_CHUNK_SIZE) {
        const chunk = items.slice(start, start + UPSERT_CHUNK_SIZE);

        await prisma.$transaction(
          async (tx) => {
            for (const p of chunk) {
              await tx.products.upsert({
                where: { super_product_id: { super: superKey, product_id: p.product_id } },
                create: {
                  super: superKey,
                  product_id: p.product_id,
                  sku_id: p.sku_id ?? null,
                  name: p.name,
                  barcode: p.barcode ?? null,
                  image_url: p.image_url ?? null,
                  product_url: p.product_url,
                  raw_price: p.raw_price ?? null,
                  offer_price: p.offer_price ?? null,
                  discount_pct: p.discount_pct,
                  available: p.available,
                  categories: p.category_paths,
                  promotions: p.promotions as object[],
                },
                update: {
                  sku_id: p.sku_id ?? null,
                  name: p.name,
                  raw_price: p.raw_price ?? null,
                  offer_price: p.offer_price ?? null,
                  discount_pct: p.discount_pct,
                  available: p.available,
                  categories: p.category_paths,
                  promotions: p.promotions as object[],
                  synced_at: new Date(),
                },
              });
            }
          },
          { timeout: 60_000, maxWait: 10_000 },
        );
      }
    },

    async deleteStaleForSuper(superKey, logId) {
      const result = await prisma.$executeRaw(Prisma.sql`
        DELETE FROM products
        WHERE super = ${superKey}
          AND synced_at < (SELECT started_at FROM sync_log WHERE id = ${logId})
      `);
      return result;
    },

    async insertSyncLog(superKey) {
      const log = await prisma.sync_log.create({
        data: {
          super: superKey,
          started_at: new Date(),
          status: 'running',
          progress_leaf: 0,
          total_leaves: 0,
        },
      });
      return log.id;
    },

    async updateSyncProgress(progressLeaf, totalLeaves, productCount, logId) {
      await prisma.sync_log.update({
        where: { id: logId },
        data: { progress_leaf: progressLeaf, total_leaves: totalLeaves, product_count: productCount },
      });
    },

    async finishSyncLog(productCount, logId) {
      await prisma.sync_log.update({
        where: { id: logId },
        data: {
          finished_at: new Date(),
          product_count: productCount,
          status: 'ok',
          progress_leaf: undefined, // keep existing
        },
      });
    },

    async failSyncLog(errorMessage, logId) {
      await prisma.sync_log.update({
        where: { id: logId },
        data: { finished_at: new Date(), status: 'error', error: errorMessage },
      });
    },

    async getSyncStatus() {
      const rows = await prisma.$queryRaw<
        Array<{
          super: string;
          started_at: Date | null;
          finished_at: Date | null;
          product_count: number | null;
          status: string;
          error: string | null;
          progress_leaf: number;
          total_leaves: number;
        }>
      >(Prisma.sql`
        SELECT super, started_at, finished_at, product_count, status, error,
               progress_leaf, total_leaves
        FROM sync_log
        WHERE id IN (SELECT MAX(id) FROM sync_log GROUP BY super)
        ORDER BY super
      `);

      return rows.map((r) => ({
        ...r,
        started_at: r.started_at ? r.started_at.toISOString() : null,
        finished_at: r.finished_at ? r.finished_at.toISOString() : null,
      })) as SyncLog[];
    },
  };
}
