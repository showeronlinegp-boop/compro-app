import type { PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { asyncHandler } from '../../../shared/http.js';
import { makeShoppingRepo } from './shopping.repo.js';

/**
 * Creates the shopping router.
 * HTTP contract is identical to backend/routes/shopping.js:
 *   GET    /         → list all shopping items (joined with products)
 *   GET    /weekly   → list due items grouped by super with running total
 *   POST   /         → add product to shopping list (400/404 guards)
 *   PUT    /:id      → update frequency_days, last_bought, notes
 *   DELETE /:id      → remove shopping item by id
 */
export function makeShoppingRouter(prisma: PrismaClient): Router {
  const repo = makeShoppingRepo(prisma);
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      res.json(await repo.list());
    }),
  );

  router.get(
    '/weekly',
    asyncHandler(async (_req, res) => {
      res.json(await repo.listWeekly());
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const {
        product_id,
        frequency_days = 7,
        notes = '',
      } = req.body as {
        product_id?: unknown;
        frequency_days?: unknown;
        notes?: unknown;
      };

      if (!product_id) {
        return res.status(400).json({ error: 'product_id requerido' });
      }

      try {
        const result = await repo.create({
          product_id: Number(product_id),
          frequency_days: Number(frequency_days),
          notes: String(notes),
        });
        if (result.already) {
          return res.json(result);
        }
        return res.status(201).json(result);
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        if (e.statusCode === 404) {
          return res.status(404).json({ error: e.message });
        }
        throw err;
      }
    }),
  );

  router.put(
    '/:id',
    asyncHandler(async (req, res) => {
      const { frequency_days, last_bought, notes } = req.body as {
        frequency_days?: unknown;
        last_bought?: unknown;
        notes?: unknown;
      };

      try {
        const result = await repo.update(Number(req.params.id), {
          frequency_days: frequency_days != null ? Number(frequency_days) : undefined,
          last_bought: last_bought !== undefined ? (last_bought as string | null) : undefined,
          notes: notes !== undefined ? String(notes) : undefined,
        });
        return res.json(result);
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        if (e.statusCode === 404) {
          return res.status(404).json({ error: e.message });
        }
        if (e.statusCode === 400) {
          return res.status(400).json({ error: e.message });
        }
        throw err;
      }
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      try {
        const result = await repo.remove(Number(req.params.id));
        return res.json(result);
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        if (e.statusCode === 404) {
          return res.status(404).json({ error: e.message });
        }
        throw err;
      }
    }),
  );

  return router;
}
