export interface CartItem {
  skuId: string;
  qty: number;
  name: string;
}

export interface CartResult {
  url: string;
  items_added: number;
  items_missing: number;
  missing_names: string[];
}

export function parseQty(notes: string | null): number {
  const m = (notes ?? '').match(/x(\d+)$/);
  return m ? parseInt(m[1], 10) : 1;
}

// Builds a /checkout/cart/add URL with all items as query params.
// VTEX processes this server-side in the USER's browser session:
// sets checkout.vtex.com cookie in the browser and redirects to cart.
// This avoids the session/cookie mismatch of creating the cart from our backend.
export function buildCartAddUrl(baseUrl: string, items: CartItem[]): string {
  const params = new URLSearchParams();
  for (const item of items) {
    params.append('sku', item.skuId);
    params.append('qty', String(item.qty));
    params.append('seller', '1');
  }
  return `${baseUrl}/checkout/cart/add?${params.toString()}`;
}
