import { type ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api';
import type { CartItemEntry, CartResult } from '../types/api';

// ─── State context (subscribed by many cards — split to limit re-renders) ────

interface CartState {
  cart: CartResult | null;
  isOpen: boolean;
}

const CartStateContext = createContext<CartState | null>(null);

// ─── Dispatch context (stable references via useCallback) ─────────────────────

interface CartDispatch {
  addItem: (product_id: number, quantity?: number) => Promise<void>;
  updateQty: (cart_item_id: number, quantity: number) => Promise<void>;
  removeItem: (cart_item_id: number) => Promise<void>;
  clear: () => Promise<void>;
  openCart: () => void;
  closeCart: () => void;
}

const CartDispatchContext = createContext<CartDispatch | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartResult | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  // Load cart once on mount
  useEffect(() => {
    api.cart.get().then(setCart).catch(console.error);
  }, []);

  const addItem = useCallback(async (product_id: number, quantity = 1) => {
    const result = await api.cart.addItem(product_id, quantity);
    setCart(result);
  }, []);

  const updateQty = useCallback(async (cart_item_id: number, quantity: number) => {
    const result = await api.cart.updateQty(cart_item_id, quantity);
    setCart(result);
  }, []);

  const removeItem = useCallback(async (cart_item_id: number) => {
    const result = await api.cart.removeItem(cart_item_id);
    setCart(result);
  }, []);

  const clear = useCallback(async () => {
    const result = await api.cart.clear();
    setCart(result);
  }, []);

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  return (
    <CartStateContext.Provider value={{ cart, isOpen }}>
      <CartDispatchContext.Provider
        value={{ addItem, updateQty, removeItem, clear, openCart, closeCart }}
      >
        {children}
      </CartDispatchContext.Provider>
    </CartStateContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface UseCartResult {
  items: CartItemEntry[];
  itemCount: number;
  isOpen: boolean;
  addItem: (product_id: number, quantity?: number) => Promise<void>;
  updateQty: (cart_item_id: number, quantity: number) => Promise<void>;
  removeItem: (cart_item_id: number) => Promise<void>;
  clear: () => Promise<void>;
  openCart: () => void;
  closeCart: () => void;
}

export function useCart(): UseCartResult {
  const state = useContext(CartStateContext);
  const dispatch = useContext(CartDispatchContext);

  if (!state || !dispatch) {
    throw new Error('useCart must be used inside <CartProvider>');
  }

  return {
    items: state.cart?.items ?? [],
    itemCount: state.cart?.item_count ?? 0,
    isOpen: state.isOpen,
    addItem: dispatch.addItem,
    updateQty: dispatch.updateQty,
    removeItem: dispatch.removeItem,
    clear: dispatch.clear,
    openCart: dispatch.openCart,
    closeCart: dispatch.closeCart,
  };
}
