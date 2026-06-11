import type Database from 'better-sqlite3';
import { Router } from 'express';
import { asyncHandler } from '../../../shared/http.js';
import type { TaxonomyEntry } from '../../../shared/types.js';
import { getVtexStrings } from '../../taxonomy/domain/taxonomy.js';
import { makeCatalogRepo } from './catalog.repo.js';

/**
 * Creates the catalog router.
 * HTTP contract is identical to backend/routes/products.js:
 *   GET /              → paginated product search
 *     ?q=              → name LIKE
 *     ?super=          → exact super match
 *     ?category=       → taxonomy slug filter
 *     ?discount=1      → only discounted items
 *     ?available=1     → only available items
 *     ?page=&limit=    → pagination (default: page=1, limit=48, max limit=100)
 *   GET /groups        → products grouped by barcode across supers (2+ supers only)
 *   GET /categories    → taxonomy list [{slug, label, icon}]
 */
export function makeCatalogRouter(db: Database.Database, taxonomy: TaxonomyEntry[]): Router {
  const repo = makeCatalogRepo(db);
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const params = req.query as {
        q?: string;
        super?: string;
        category?: string;
        discount?: string;
        available?: string;
        page?: string;
        limit?: string;
      };

      const vtexStrings = params.category ? getVtexStrings(params.category) : [];
      const result = repo.search({ ...params, vtexStrings });
      res.json(result);
    }),
  );

  // NOTE: /groups and /categories MUST be registered before /:id routes
  // if any are added in the future.
  router.get(
    '/groups',
    asyncHandler(async (req, res) => {
      const { q, category, discount, super: superKey, page, limit } = req.query as {
        q?: string;
        category?: string;
        discount?: string;
        super?: string;
        page?: string;
        limit?: string;
      };

      const vtexStrings = category ? getVtexStrings(category) : [];
      const result = repo.getGroups({
        q,
        category,
        discount,
        super: superKey,
        page,
        limit,
        vtexStrings,
      });
      res.json(result);
    }),
  );

  router.get(
    '/categories',
    asyncHandler(async (_req, res) => {
      res.json(taxonomy.map(({ slug, label, icon }) => ({ slug, label, icon })));
    }),
  );

  return router;
}
