import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CartResult } from '../types/api';
import { CartProvider, useCart } from './CartContext';

// ─── Mock api.cart ────────────────────────────────────────────────────────────

const mockGet = vi.fn<() => Promise<CartResult>>();
const mockAddItem = vi.fn<(product_id: number, quantity?: number) => Promise<CartResult>>();
const mockUpdateQty = vi.fn<(cart_item_id: number, quantity: number) => Promise<CartResult>>();
const mockRemoveItem = vi.fn<(cart_item_id: number) => Promise<CartResult>>();
const mockClear = vi.fn<() => Promise<CartResult>>();

vi.mock('../api', () => ({
  api: {
    cart: {
      get: () => mockGet(),
      addItem: (product_id: number, quantity?: number) => mockAddItem(product_id, quantity),
      updateQty: (cart_item_id: number, quantity: number) => mockUpdateQty(cart_item_id, quantity),
      removeItem: (cart_item_id: number) => mockRemoveItem(cart_item_id),
      clear: () => mockClear(),
    },
  },
}));

// CartProvider reads Clerk auth state; mock it as signed-in so the cart loads.
vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ isSignedIn: true }),
  useClerk: () => ({ redirectToSignIn: () => Promise.resolve() }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCart(overrides: Partial<CartResult> = {}): CartResult {
  return {
    cart_id: 1,
    items: [],
    item_count: 0,
    ...overrides,
  };
}

// Small component that captures useCart() output via a ref-like variable
interface CartState {
  itemCount: number;
  itemsLength: number;
  addItem: (product_id: number, quantity?: number) => Promise<void>;
  updateQty: (cart_item_id: number, quantity: number) => Promise<void>;
  removeItem: (cart_item_id: number) => Promise<void>;
  clear: () => Promise<void>;
}

let captured: CartState | null = null;

function TestConsumer() {
  const { itemCount, items, addItem, updateQty, removeItem, clear } = useCart();
  captured = { itemCount, itemsLength: items.length, addItem, updateQty, removeItem, clear };
  return null;
}

function setup() {
  captured = null;
  render(
    <CartProvider>
      <TestConsumer />
    </CartProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CartContext behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured = null;
  });

  it('loads initial state on mount', async () => {
    const initialCart = makeCart({ item_count: 3 });
    mockGet.mockResolvedValue(initialCart);

    setup();

    await waitFor(() => {
      expect(captured?.itemCount).toBe(3);
    });
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('addItem increases itemCount', async () => {
    mockGet.mockResolvedValue(makeCart());
    const afterAdd = makeCart({ item_count: 1 });
    mockAddItem.mockResolvedValue(afterAdd);

    setup();
    await waitFor(() => expect(captured?.itemCount).toBe(0));

    await act(async () => {
      await captured?.addItem(42);
    });

    expect(captured?.itemCount).toBe(1);
    // CartContext default quantity=1, so the api receives 42, 1
    expect(mockAddItem).toHaveBeenCalledWith(42, 1);
  });

  it('adding same product twice increments count (mock returns qty:2)', async () => {
    mockGet.mockResolvedValue(makeCart());
    mockAddItem
      .mockResolvedValueOnce(makeCart({ item_count: 1 }))
      .mockResolvedValueOnce(makeCart({ item_count: 2 }));

    setup();
    await waitFor(() => expect(captured?.itemCount).toBe(0));

    await act(async () => {
      await captured?.addItem(99);
    });
    expect(captured?.itemCount).toBe(1);

    await act(async () => {
      await captured?.addItem(99);
    });
    expect(captured?.itemCount).toBe(2);
  });

  it('removeItem decreases itemCount', async () => {
    mockGet.mockResolvedValue(makeCart({ item_count: 2 }));
    const afterRemove = makeCart({ item_count: 1 });
    mockRemoveItem.mockResolvedValue(afterRemove);

    setup();
    await waitFor(() => expect(captured?.itemCount).toBe(2));

    await act(async () => {
      await captured?.removeItem(7);
    });

    expect(captured?.itemCount).toBe(1);
    expect(mockRemoveItem).toHaveBeenCalledWith(7);
  });

  it('clear sets itemCount to 0', async () => {
    mockGet.mockResolvedValue(makeCart({ item_count: 5 }));
    mockClear.mockResolvedValue(makeCart({ item_count: 0 }));

    setup();
    await waitFor(() => expect(captured?.itemCount).toBe(5));

    await act(async () => {
      await captured?.clear();
    });

    expect(captured?.itemCount).toBe(0);
    expect(mockClear).toHaveBeenCalledTimes(1);
  });

  it('updateQty calls api with correct args and reflects mocked response', async () => {
    mockGet.mockResolvedValue(makeCart({ item_count: 1 }));
    const afterUpdate = makeCart({ item_count: 3, items: [{}] as CartResult['items'] });
    mockUpdateQty.mockResolvedValue(afterUpdate);

    setup();
    await waitFor(() => expect(captured?.itemCount).toBe(1));

    await act(async () => {
      await captured?.updateQty(7, 3);
    });

    expect(mockUpdateQty).toHaveBeenCalledWith(7, 3);
    expect(captured?.itemCount).toBe(3);
    expect(captured?.itemsLength).toBe(1);
  });
});
