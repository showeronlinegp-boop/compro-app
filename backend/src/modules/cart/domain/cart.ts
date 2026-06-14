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

export async function buildVtexCart(
  baseUrl: string,
  items: CartItem[],
): Promise<string> {
  const createRes = await fetch(`${baseUrl}/api/checkout/pub/orderForm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  });
  if (!createRes.ok) throw new Error(`VTEX orderForm create failed: ${createRes.status}`);
  const { orderFormId } = (await createRes.json()) as { orderFormId: string };

  const addRes = await fetch(
    `${baseUrl}/api/checkout/pub/orderForm/${orderFormId}/items`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        orderItems: items.map((i) => ({ id: i.skuId, quantity: i.qty, seller: '1' })),
      }),
    },
  );
  if (!addRes.ok) throw new Error(`VTEX add items failed: ${addRes.status}`);

  return orderFormId;
}
