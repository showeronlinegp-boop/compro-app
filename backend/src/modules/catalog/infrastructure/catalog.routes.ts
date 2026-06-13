import type { PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { asyncHandler } from '../../../shared/http.js';
import type { TaxonomyEntry } from '../../../shared/types.js';
import { getVtexStrings } from '../../taxonomy/domain/taxonomy.js';
import { makeCatalogRepo } from './catalog.repo.js';

/**
 * Creates the catalog router.
 * HTTP contract is identical to the legacy products.js:
 *   GET /              → paginated product search
 *     ?q=              → name LIKE (accent/punctuation-insensitive via unaccent)
 *     ?super=          → exact super match
 *     ?category=       → taxonomy slug filter
 *     ?discount=1      → only discounted items
 *     ?available=1     → only available items
 *     ?sort=           → relevance (default) | discount_desc | price_asc | price_desc
 *     ?page=&limit=    → pagination (default: page=1, limit=48, max limit=100)
 *   GET /groups        → products grouped by barcode across supers
 *   GET /categories    → taxonomy list [{slug, label, icon}]
 */
export function makeCatalogRouter(prisma: PrismaClient, taxonomy: TaxonomyEntry[]): Router {
  const repo = makeCatalogRepo(prisma);
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
        sort?: string;
        page?: string;
        limit?: string;
      };

      const vtexStrings = params.category ? getVtexStrings(params.category) : [];
      const result = await repo.search({ ...params, vtexStrings });
      res.json(result);
    }),
  );

  router.get(
    '/groups',
    asyncHandler(async (req, res) => {
      const { q, category, discount, super: superKey, sort, page, limit } = req.query as {
        q?: string;
        category?: string;
        discount?: string;
        super?: string;
        sort?: string;
        page?: string;
        limit?: string;
      };

      const vtexStrings = category ? getVtexStrings(category) : [];
      const result = await repo.getGroups({
        q,
        category,
        discount,
        super: superKey,
        sort,
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
