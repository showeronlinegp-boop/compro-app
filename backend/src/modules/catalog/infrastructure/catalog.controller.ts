import { Controller, Get, Inject, Query } from '@nestjs/common';
import { CATALOG_REPO } from '../../../common/tokens.js';
import { getVtexStrings, TAXONOMY } from '../../taxonomy/domain/taxonomy.js';
import type { CatalogRepo } from './catalog.repo.js';

interface CatalogQueryParams {
  q?: string;
  super?: string;
  category?: string;
  discount?: string;
  available?: string;
  sort?: string;
  page?: string;
  limit?: string;
}

@Controller('api/products')
export class CatalogController {
  constructor(@Inject(CATALOG_REPO) private readonly repo: CatalogRepo) {}

  @Get()
  async list(@Query() params: CatalogQueryParams) {
    const vtexStrings = params.category ? getVtexStrings(params.category) : [];
    return this.repo.search({ ...params, vtexStrings });
  }

  @Get('groups')
  async groups(@Query() params: CatalogQueryParams) {
    const vtexStrings = params.category ? getVtexStrings(params.category) : [];
    return this.repo.getGroups({
      q: params.q,
      category: params.category,
      discount: params.discount,
      super: params.super,
      sort: params.sort,
      page: params.page,
      limit: params.limit,
      vtexStrings,
    });
  }

  @Get('categories')
  categories() {
    return TAXONOMY.map(({ slug, label, icon }) => ({ slug, label, icon }));
  }
}
