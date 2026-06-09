import type Database from 'better-sqlite3';
import { Router } from 'express';
import { asyncHandler } from '../../../shared/http.js';
import { makeInterestsRepo } from './interests.repo.js';

/**
 * Creates the interests router.
 * HTTP contract is identical to backend/routes/interests.js:
 *   GET    /        → list all interests (joined with products)
 *   POST   /        → add interest for product_id (400 if missing, 404 if product not found)
 *   DELETE /:id     → remove interest by id (404 if not found)
 */
export function makeInterestsRouter(db: Database.Database): Router {
  const repo = makeInterestsRepo(db);
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      res.json(repo.list());
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const { product_id } = req.body as { product_id?: unknown };
      if (!product_id) {
        return res.status(400).json({ error: 'product_id requerido' });
      }

      try {
        const result = repo.create(Number(product_id));
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

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      try {
        const result = repo.remove(Number(req.params.id));
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
