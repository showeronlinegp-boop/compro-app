import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CartItemEntry, CompareResult } from '../types/api';

// ─── Mock useCart ─────────────────────────────────────────────────────────────

const mockClear = vi.fn<() => Promise<void>>();
const mockUpdateQty = vi.fn<(id: number, qty: number) => Promise<void>>();
const mockRemoveItem = vi.fn<(id: number) => Promise<void>>();

// Mutable so individual tests can override items / itemCount
let mockItems: CartItemEntry[] = [];
let mockItemCount = 0;

vi.mock('../contexts/CartContext', () => ({
  useCart: () => ({
    items: mockItems,
    itemCount: mockItemCount,
    clear: mockClear,
    updateQty: mockUpdateQty,
    removeItem: mockRemoveItem,
  }),
}));

// ─── Mock api ─────────────────────────────────────────────────────────────────

const mockCompare = vi.fn<() => Promise<CompareResult>>();

vi.mock('../api', () => ({
  api: {
    cart: {
      compare: () => mockCompare(),
    },
  },
}));

// ─── Factories ────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<CartItemEntry> = {}): CartItemEntry {
  return {
    cart_item_id: 1,
    quantity: 1,
    added_at: '2026-01-01T00:00:00Z',
    id: 10,
    super: 'vea',
    product_id: 'p1',
    sku_id: null,
    name: 'Leche',
    barcode: null,
    image_url: null,
    product_url: null,
    raw_price: 500,
    offer_price: null,
    discount_pct: 0,
    available: true,
    categories: [],
    promotions: [],
    synced_at: '2026-01-01T00:00:00Z',
    category_key: null,
    ...overrides,
  };
}

function makeCompareResult(overrides: Partial<CompareResult> = {}): CompareResult {
  return {
    items: [
      {
        shopping_id: 1,
        name: 'Leche',
        home_super: 'vea',
        home_price: 500,
        home_unit_price: 500,
        home_promo_label: null,
        home_info_badges: [],
        matches: [
          {
            super: 'carrefour',
            product_id: 99,
            name: 'Leche entera',
            price: 450,
            matched_by: 'barcode',
            unit_price: 450,
            promo_label: null,
            info_badges: [],
          },
        ],
        opportunity: null,
      },
    ],
    option_a: [
      { super: 'carrefour', total: 450, coverage: 100, missing_items: 0 },
      { super: 'vea', total: 500, coverage: 100, missing_items: 0 },
    ],
    option_b: {
      total: 450,
      by_super: [{ super: 'carrefour', total: 450, coverage: 100, missing_items: 0 }],
      breakdown: [{ shopping_id: 1, best_super: 'carrefour', price: 450 }],
      savings_vs_option_a: 50,
    },
    ...overrides,
  };
}

// ─── Import component AFTER mocks ─────────────────────────────────────────────

// Dynamic import is not needed because vi.mock is hoisted; just import normally.
import Cart from './Cart';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderCart() {
  return render(<Cart />);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Cart compare tab behavior', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: one item in cart
    mockItems = [makeItem()];
    mockItemCount = 1;
  });

  it('clicking Comparar triggers api.cart.compare once and renders Option A section', async () => {
    mockCompare.mockResolvedValue(makeCompareResult());

    renderCart();

    // Default tab is Editar — compare not called yet
    expect(mockCompare).not.toHaveBeenCalled();

    const comparar = screen.getByRole('button', { name: 'Comparar' });
    act(() => {
      fireEvent.click(comparar);
    });

    await waitFor(() => expect(mockCompare).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Opción A — Todo en un super')).toBeDefined());
  });

  it('default Editar tab does not call api.cart.compare', () => {
    renderCart();
    expect(mockCompare).not.toHaveBeenCalled();
  });

  it('empty compare result shows empty state message and no Option A/B tables', async () => {
    mockCompare.mockResolvedValue(
      makeCompareResult({
        items: [],
        option_a: [],
        option_b: { total: 0, by_super: [], breakdown: [], savings_vs_option_a: 0 },
      }),
    );

    renderCart();

    const comparar = screen.getByRole('button', { name: 'Comparar' });
    act(() => {
      fireEvent.click(comparar);
    });

    await waitFor(() => expect(screen.getByText('Sin resultados para comparar')).toBeDefined());

    expect(screen.queryByText('Opción A — Todo en un super')).toBeNull();
    expect(screen.queryByText('Opción B — El más barato por ítem')).toBeNull();
  });

  it('shows "Comparamos N de M productos" when matched < items.length', async () => {
    // 2 cart items; compare result has only 1 item with a cross-super match
    mockItems = [makeItem({ cart_item_id: 1 }), makeItem({ cart_item_id: 2, name: 'Arroz' })];
    mockItemCount = 2;

    // One item has a cross-super match; the other only has its home_super match
    const result = makeCompareResult({
      items: [
        {
          shopping_id: 1,
          name: 'Leche',
          home_super: 'vea',
          home_price: 500,
          home_unit_price: 500,
          home_promo_label: null,
          home_info_badges: [],
          matches: [
            {
              super: 'carrefour',
              product_id: 99,
              name: 'Leche entera',
              price: 450,
              matched_by: 'barcode',
              unit_price: 450,
              promo_label: null,
              info_badges: [],
            },
          ],
          opportunity: null,
        },
        {
          shopping_id: 2,
          name: 'Arroz',
          home_super: 'vea',
          home_price: 300,
          home_unit_price: 300,
          home_promo_label: null,
          home_info_badges: [],
          // Only home_super match — no cross-super
          matches: [
            {
              super: 'vea',
              product_id: 50,
              name: 'Arroz',
              price: 300,
              matched_by: 'barcode',
              unit_price: 300,
              promo_label: null,
              info_badges: [],
            },
          ],
          opportunity: null,
        },
      ],
    });
    mockCompare.mockResolvedValue(result);

    renderCart();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    });

    await waitFor(() => expect(screen.getByText('Comparamos 1 de 2 productos')).toBeDefined());
  });

  it('stale guard: changed signature triggers a second fetch on re-activation', async () => {
    mockCompare.mockResolvedValue(makeCompareResult());

    const { rerender } = renderCart();

    // First activation → fetch #1
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    });
    await waitFor(() => expect(mockCompare).toHaveBeenCalledTimes(1));

    // Switch back to Editar
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    });

    // Mutate mockItems (different quantity → different sig) then re-render
    // so the component picks up the new items before we re-activate Comparar.
    mockItems = [makeItem({ cart_item_id: 1, quantity: 3 })];
    mockItemCount = 3;
    rerender(<Cart />);

    // Re-activate Comparar → sig changed → fetch #2
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    });
    await waitFor(() => expect(mockCompare).toHaveBeenCalledTimes(2));
  });

  it('no needless refetch: unchanged cart does not trigger a second fetch', async () => {
    mockCompare.mockResolvedValue(makeCompareResult());

    renderCart();

    // Open Comparar → fetch #1
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    });
    await waitFor(() => expect(mockCompare).toHaveBeenCalledTimes(1));

    // Switch to Editar (cart unchanged)
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    });

    // Back to Comparar — same sig → guard must skip the fetch
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    });

    // Still exactly one call
    await waitFor(() => expect(mockCompare).toHaveBeenCalledTimes(1));
  });
});

// ─── Task 6: PromoNudge / Oportunidades section ───────────────────────────────

import type { PromoOpportunity } from '../types/api';

function makeOpportunity(overrides: Partial<PromoOpportunity> = {}): PromoOpportunity {
  return {
    shopping_id: 1,
    missing_units: 1,
    target_qty: 2,
    best_super: 'dia',
    best_product_id: 42,
    effective_unit_price_at_target: 800,
    current_best_unit_price: 1000,
    current_best_super: 'vea',
    flips_super: false,
    promo_label: '2do al 80%',
    ...overrides,
  };
}

function makeCompareResultWithOpportunity(
  opp: PromoOpportunity | null,
  overrides: Partial<CompareResult> = {},
): CompareResult {
  return {
    items: [
      {
        shopping_id: 1,
        name: 'Oreo',
        home_super: 'vea',
        home_price: 1000,
        home_unit_price: 1000,
        home_promo_label: null,
        home_info_badges: [],
        matches: [
          {
            super: 'dia',
            product_id: 42,
            name: 'Oreo DIA',
            price: 800,
            matched_by: 'barcode',
            unit_price: 1000,
            promo_label: '2do al 80%',
            info_badges: [],
          },
        ],
        opportunity: opp,
      },
    ],
    option_a: [{ super: 'dia', total: 800, coverage: 100, missing_items: 0 }],
    option_b: {
      total: 800,
      by_super: [{ super: 'dia', total: 800, coverage: 100, missing_items: 0 }],
      breakdown: [{ shopping_id: 1, best_super: 'dia', price: 800 }],
      savings_vs_option_a: 200,
    },
    ...overrides,
  };
}

describe('Cart Oportunidades section', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockItems = [makeItem()];
    mockItemCount = 1;
  });

  it('renders nudge card copy and flips badge when flips_super=true', async () => {
    const opp = makeOpportunity({ flips_super: true });
    mockCompare.mockResolvedValue(makeCompareResultWithOpportunity(opp));

    renderCart();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    });

    // Wait for the Oportunidades section root to appear
    await waitFor(() => expect(screen.getByTestId('opportunities-section')).toBeDefined());

    const section = screen.getByTestId('opportunities-section');

    // Section heading
    expect(section.textContent).toContain('Oportunidades');

    // Nudge copy: "Agregá N más de <name> te conviene …"
    expect(section.textContent).toContain('Agregá');
    expect(section.textContent).toContain('más de');
    expect(section.textContent).toContain('Oreo');

    // target_qty shown in the Agregar button
    expect(screen.getByRole('button', { name: /Agregar 2/i })).toBeDefined();

    // Super name pills appear inside the nudge section
    expect(section.textContent).toMatch(/DIA/i);
    expect(section.textContent).toMatch(/VEA/i);

    // flips badge
    expect(screen.getByTestId('flips-badge')).toBeDefined();
    expect(screen.getByTestId('flips-badge').textContent).toContain('Cambia el súper más barato');
  });

  it('Agregar button calls updateQty with (shopping_id, target_qty) and is disabled during the call; re-fetches compare when sig changes', async () => {
    let resolveAgregar!: () => void;
    mockUpdateQty.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveAgregar = resolve;
      }),
    );

    const opp = makeOpportunity({ shopping_id: 1, target_qty: 2 });
    mockCompare.mockResolvedValue(makeCompareResultWithOpportunity(opp));

    const { rerender } = renderCart();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    });

    await waitFor(() => expect(screen.getByRole('button', { name: /Agregar 2/i })).toBeDefined());
    expect(mockCompare).toHaveBeenCalledTimes(1);

    const btn = screen.getByRole('button', { name: /Agregar 2/i });

    // Click to start the call
    act(() => {
      fireEvent.click(btn);
    });

    // Button should be disabled while promise is in flight
    await waitFor(() => expect(screen.getByRole('button', { name: /Agregando/i })).toBeDefined());
    expect(screen.getByRole('button', { name: /Agregando/i }).hasAttribute('disabled')).toBe(true);

    // Resolve updateQty — simulates the cart item quantity changing to target_qty (sig changes)
    act(() => {
      resolveAgregar();
    });

    await waitFor(() => expect(mockUpdateQty).toHaveBeenCalledWith(1, 2));

    // Simulate the cart context reflecting the new quantity (sig changes from 1:1 → 1:2)
    mockItems = [makeItem({ cart_item_id: 1, quantity: 2 })];
    mockItemCount = 2;
    rerender(<Cart />);

    // The stale-sig guard must trigger a second compare fetch
    await waitFor(() => expect(mockCompare).toHaveBeenCalledTimes(2));
  });

  it('Agregar button returns to enabled (loading=false) when onAgregar rejects', async () => {
    mockUpdateQty.mockRejectedValue(new Error('network error'));

    const opp = makeOpportunity({ shopping_id: 1, target_qty: 2 });
    mockCompare.mockResolvedValue(makeCompareResultWithOpportunity(opp));

    renderCart();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    });

    await waitFor(() => expect(screen.getByRole('button', { name: /Agregar 2/i })).toBeDefined());

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Agregar 2/i }));
    });

    // After the rejection settles the button must be re-enabled (no loading state)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Agregar 2/i }).hasAttribute('disabled')).toBe(
        false,
      ),
    );
  });

  it('sorts nudge cards by projected savings descending', async () => {
    // Item A: saving = (1000 - 700) × 3 = 900
    const oppA: PromoOpportunity = makeOpportunity({
      shopping_id: 1,
      current_best_unit_price: 1000,
      effective_unit_price_at_target: 700,
      target_qty: 3,
      best_super: 'dia',
      current_best_super: 'vea',
    });
    // Item B: saving = (800 - 600) × 2 = 400  (lower — should render second)
    const oppB: PromoOpportunity = makeOpportunity({
      shopping_id: 2,
      current_best_unit_price: 800,
      effective_unit_price_at_target: 600,
      target_qty: 2,
      best_super: 'carrefour',
      current_best_super: 'dia',
    });

    const result: CompareResult = {
      items: [
        {
          shopping_id: 1,
          name: 'Oreo',
          home_super: 'vea',
          home_price: 1000,
          home_unit_price: 1000,
          home_promo_label: null,
          home_info_badges: [],
          matches: [],
          opportunity: oppA,
        },
        {
          shopping_id: 2,
          name: 'Leche',
          home_super: 'dia',
          home_price: 800,
          home_unit_price: 800,
          home_promo_label: null,
          home_info_badges: [],
          matches: [],
          opportunity: oppB,
        },
      ],
      option_a: [{ super: 'vea', total: 1800, coverage: 100, missing_items: 0 }],
      option_b: {
        total: 1300,
        by_super: [{ super: 'vea', total: 1300, coverage: 100, missing_items: 0 }],
        breakdown: [
          { shopping_id: 1, best_super: 'vea', price: 1000 },
          { shopping_id: 2, best_super: 'dia', price: 800 },
        ],
        savings_vs_option_a: 500,
      },
    };

    mockItems = [makeItem({ cart_item_id: 1 }), makeItem({ cart_item_id: 2, name: 'Leche' })];
    mockItemCount = 2;
    mockCompare.mockResolvedValue(result);

    renderCart();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    });

    await waitFor(() => expect(screen.getByTestId('opportunities-section')).toBeDefined());

    const section = screen.getByTestId('opportunities-section');
    const nudgeButtons = section.querySelectorAll('button[type="button"]');

    // First nudge button should say "Agregar 3" (item A — higher savings)
    expect(nudgeButtons[0]?.textContent).toContain('Agregar 3');
    // Second nudge button should say "Agregar 2" (item B — lower savings)
    expect(nudgeButtons[1]?.textContent).toContain('Agregar 2');
  });

  it('does not render Oportunidades heading when all opportunity fields are null', async () => {
    mockCompare.mockResolvedValue(makeCompareResultWithOpportunity(null));

    renderCart();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    });

    await waitFor(() => expect(screen.getByText('Opción A — Todo en un super')).toBeDefined());

    expect(screen.queryByText('Oportunidades')).toBeNull();
    expect(screen.queryByTestId('opportunities-section')).toBeNull();
  });
});
