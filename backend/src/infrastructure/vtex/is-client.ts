/**
 * is-client.ts — VTEX Intelligent Search API client.
 *
 * Ported from vtex-crawler.js: searchPage(), getCatalogTree().
 * NOT yet wired into the running app — Slice 5 cutover.
 */

import {
  CRAWLER_IS_SAFE_MAX,
  CRAWLER_PAGE_SIZE,
  CRAWLER_THROTTLE_MS,
} from '../../config/throttles.js';
import { fetchJson } from '../../shared/fetch.js';
import type { SuperConfig } from '../../shared/types.js';

const IS_BASE = '/api/io/_v/api/intelligent-search';

// ---------------------------------------------------------------------------
// IS API response types
// ---------------------------------------------------------------------------

export interface IsSearchItem {
  itemId: string;
  ean: string | null;
  images: Array<{ imageUrl: string }>;
  sellers: Array<{
    commertialOffer: {
      Price: number;
      ListPrice: number;
      PriceWithoutDiscount: number;
      AvailableQuantity: number;
    };
  }>;
}

export interface IsSearchProduct {
  productId: string;
  productName: string;
  productReference: string | null;
  linkText: string;
  link: string;
  categories: string[];
  items: IsSearchItem[];
}

export interface IsSearchResponse {
  recordsFiltered: number | string;
  products: IsSearchProduct[];
}

export interface CatalogTreeNode {
  id: number;
  name: string;
  hasChildren: boolean;
  url: string;
  children: CatalogTreeNode[];
}

// ---------------------------------------------------------------------------
// Client functions (port of vtex-crawler.js)
// ---------------------------------------------------------------------------

/** IS_SAFE_MAX and PAGE_SIZE re-exported for use in partition planning. */
export { CRAWLER_IS_SAFE_MAX, CRAWLER_PAGE_SIZE, CRAWLER_THROTTLE_MS };

/**
 * Fetch one page of IS product_search results for a facetPath.
 * Port of searchPage() in vtex-crawler.js.
 */
export async function searchPage(
  cfg: SuperConfig,
  facetPath: string,
  page: number,
): Promise<{ products: IsSearchProduct[]; total: number }> {
  const encodedPath = facetPath.split('/').map(encodeURIComponent).join('/');

  const url =
    `${cfg.baseUrl}${IS_BASE}/product_search/${encodedPath}` +
    `?query=&page=${page}&count=${CRAWLER_PAGE_SIZE}&hideUnavailableItems=true&simulationBehavior=default`;

  const data = await fetchJson<IsSearchResponse>(url);

  const total =
    data.recordsFiltered == null || Number.isNaN(Number(data.recordsFiltered))
      ? 0
      : Number(data.recordsFiltered);

  return { products: data.products ?? [], total };
}

/**
 * Fetch the catalog category tree up to the given depth.
 * Port of getCatalogTree() in vtex-crawler.js.
 */
export async function getCatalogTree(cfg: SuperConfig, depth = 2): Promise<CatalogTreeNode[]> {
  return fetchJson<CatalogTreeNode[]>(
    `${cfg.baseUrl}/api/catalog_system/pub/category/tree/${depth}`,
  );
}
