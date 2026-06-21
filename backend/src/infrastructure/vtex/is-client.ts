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

/**
 * A VTEX teaser = a conditional / cart-level promotion that does NOT lower the
 * unit price (e.g. "2do al 80%", "2x1"). It only materializes once the cart
 * meets `conditions.minimumQuantity`, so it never shows up as Price <
 * PriceWithoutDiscount. We capture it separately from the unit discount.
 */
export interface IsTeaser {
  name: string;
  conditions?: {
    minimumQuantity?: number;
    parameters?: Array<{ name: string; value: string }>;
  };
  effects?: {
    parameters?: Array<{ name: string; value: string }>;
  };
}

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
      teasers?: IsTeaser[];
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
 *
 * When `regionId` is provided, the IS API returns prices and availability for
 * that region (seller-set), so the same product can differ by zone. Without it,
 * the store's default region is used.
 */
export async function searchPage(
  cfg: SuperConfig,
  facetPath: string,
  page: number,
  regionId?: string | null,
): Promise<{ products: IsSearchProduct[]; total: number }> {
  const encodedPath = facetPath.split('/').map(encodeURIComponent).join('/');
  const regionParam = regionId ? `&regionId=${encodeURIComponent(regionId)}` : '';

  const url =
    `${cfg.baseUrl}${IS_BASE}/product_search/${encodedPath}` +
    `?query=&page=${page}&count=${CRAWLER_PAGE_SIZE}&hideUnavailableItems=true&simulationBehavior=default${regionParam}`;

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
