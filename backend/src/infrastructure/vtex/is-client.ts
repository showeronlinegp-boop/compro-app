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

// ---------------------------------------------------------------------------
// Single-product commercial offer (out-of-stock rescue)
// ---------------------------------------------------------------------------

/** Public-PDP commercial offer for one product: its current price and stock. */
export interface ProductOffer {
  /** commertialOffer.Price — the price VEA shows on its public product page. */
  price: number;
  /** commertialOffer.AvailableQuantity — 0 means out of stock. */
  availableQty: number;
}

/** Minimal shape of one catalog_system product entry (only the fields we read). */
interface CatalogProduct {
  items?: Array<{
    sellers?: Array<{
      commertialOffer?: { Price?: number; AvailableQuantity?: number };
    }>;
  }>;
}

/**
 * Parse the first seller's commercial offer from a catalog_system product search
 * response. Returns null when the payload has no usable offer (no products, no
 * seller, or a non-numeric price). Pure — exported for testing.
 */
export function parseProductOffer(data: CatalogProduct[]): ProductOffer | null {
  const offer = data?.[0]?.items?.[0]?.sellers?.[0]?.commertialOffer;
  if (!offer) return null;
  const price = num(offer.Price);
  if (price == null) return null;
  return { price, availableQty: num(offer.AvailableQuantity) ?? 0 };
}

function num(v: unknown): number | null {
  if (v == null || Number.isNaN(Number(v))) return null;
  return Number(v);
}

/**
 * Build the `vtex_segment` cookie value that pins catalog_system responses to a
 * region. The catalog_system endpoint IGNORES a `regionId` query param (unlike the
 * IS API), so the only way to get region-accurate price/stock from it is this
 * cookie. Verified: without it the endpoint returns the default (CABA/national)
 * price; with it, the zone price. Exported for testing.
 */
export function regionSegmentCookie(regionId: string): string {
  return `vtex_segment=${Buffer.from(JSON.stringify({ regionId })).toString('base64')}`;
}

/**
 * Fetch the current public-PDP offer for a single product by its VTEX productId.
 *
 * Uses the catalog_system search endpoint (fq=productId:N), which mirrors exactly
 * what the storefront product page shows — including the price for items that are
 * OUT OF STOCK (AvailableQuantity 0). The region-scoped IS crawl hides those via
 * hideUnavailableItems=true, so this is the only way to surface "the price as VEA's
 * page shows it" for a product that dropped out of the in-stock crawl.
 *
 * When `regionId` is given, the request is pinned to that region via the
 * vtex_segment cookie so the price/stock match the user's zone — NOT the default
 * region. Returns null on an empty/unparseable response (e.g. the product was delisted).
 */
export async function fetchProductOffer(
  cfg: SuperConfig,
  productId: string,
  regionId?: string | null,
): Promise<ProductOffer | null> {
  const url = `${cfg.baseUrl}/api/catalog_system/pub/products/search?fq=productId:${encodeURIComponent(productId)}`;
  const options = regionId ? { headers: { Cookie: regionSegmentCookie(regionId) } } : undefined;
  const data = await fetchJson<CatalogProduct[]>(url, options);
  return parseProductOffer(data);
}
