import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CartItemEntry, CompareResult } from '../types/api';

// ─── Mock useCart ─────────────────────────────────────────────────────────────

const mockClear = vi.fn<() => Promise<void>>();
const mockUpdateQty = vi.fn<(id: number, qty: number) => Promise<void>>();
const mockRemoveItem = vi.fn<(id: number) => Promise<void>>();
const mockOpenCart = vi.fn();

// Mutable so individual tests can override items / itemCount
let mockItems: CartItemEntry[] = [];
let mockItemCount = 0;

vi.mock('../contexts/CartContext', () => ({
  useCart: () => ({
    items: mockItems,
    itemCount: mockItemCount,
    isOpen: false,
    clear: mockClear,
    updateQty: mockUpdateQty,
    removeItem: mockRemoveItem,
    openCart: mockOpenCart,
    closeCart: vi.fn(),
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
            sku_id: null,
            name: 'Leche entera',
            price: 450,
            matched_by: 'barcode',
            available: true,
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
  return render(
    <MemoryRouter>
      <Cart />
    </MemoryRouter>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

/**
 * Previously the Cart page had Editar/Comparar tabs. Now /cart is the comparison-only
 * view. Compare loads on mount (no tab click required). The edit functionality moved
 * to CartDrawer (opened from the navbar cart icon).
 */
describe('Cart comparison view — loads on mount', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: one item in cart
    mockItems = [makeItem()];
    mockItemCount = 1;
  });

  it('calls api.cart.compare on mount and renders Option A section', async () => {
    mockCompare.mockResolvedValue(makeCompareResult());

    renderCart();

    await waitFor(() => expect(mockCompare).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Opción A — Todo en un super')).toBeDefined());
  });

  it('does not call compare when cart is empty (shows empty state instead)', () => {
    mockItems = [];
    mockItemCount = 0;

    renderCart();

    expect(mockCompare).not.toHaveBeenCalled();
    expect(screen.getByText('Tu carrito está vacío')).toBeDefined();
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
              sku_id: null,
              name: 'Leche entera',
              price: 450,
              matched_by: 'barcode',
              available: true,
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
              sku_id: null,
              name: 'Arroz',
              price: 300,
              matched_by: 'barcode',
              available: true,
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

    await waitFor(() => expect(screen.getByText('Comparamos 1 de 2 productos')).toBeDefined());
  });

  it('stale guard: changed signature triggers a second fetch on re-render', async () => {
    mockCompare.mockResolvedValue(makeCompareResult());

    const { rerender } = renderCart();

    // First mount → fetch #1
    await waitFor(() => expect(mockCompare).toHaveBeenCalledTimes(1));

    // Mutate mockItems (different quantity → different sig) then re-render
    mockItems = [makeItem({ cart_item_id: 1, quantity: 3 })];
    mockItemCount = 3;
    rerender(<Cart />);

    // Sig changed → fetch #2
    await waitFor(() => expect(mockCompare).toHaveBeenCalledTimes(2));
  });

  it('no needless refetch: unchanged cart does not trigger a second fetch on state update', async () => {
    mockCompare.mockResolvedValue(makeCompareResult());

    const { rerender } = renderCart();

    // Mount → fetch #1
    await waitFor(() => expect(mockCompare).toHaveBeenCalledTimes(1));

    // Re-render with the same items (same sig) wrapped correctly
    rerender(
      <MemoryRouter>
        <Cart />
      </MemoryRouter>,
    );

    // Same sig → guard must skip the fetch; wait a tick to confirm no second call
    await waitFor(() => expect(mockCompare).toHaveBeenCalledTimes(1));
  });

  it('"Editar carrito" button calls openCart', async () => {
    mockCompare.mockResolvedValue(makeCompareResult());

    renderCart();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Editar carrito' })).toBeDefined(),
    );

    act(() => {
      screen.getByRole('button', { name: 'Editar carrito' }).click();
    });

    expect(mockOpenCart).toHaveBeenCalledTimes(1);
  });
});

// ─── Task 6: PromoNudge / Oportunidades section ───────────────────────────────

import type { PromoOpportunity } from '../types/api';

function makeOpportunity(overrides: Partial<PromoOpportunity> = {}): PromoOpportunity {
  return {
    shopping_id: 1,
    missing_units: 1,
    target_qty: 2,
    // Default: promo worth it but the cheapest super does NOT change (same-super
    // case). best_super === current_best_super, so flips_super is false — this is
    // the internally-consistent shape the backend actually emits.
    best_super: 'dia',
    best_product_id: 42,
    effective_unit_price_at_target: 800,
    current_best_unit_price: 1000,
    current_best_super: 'dia',
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
            sku_id: null,
            name: 'Oreo DIA',
            price: 800,
            matched_by: 'barcode',
            available: true,
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

  it('renders cross-super copy and flips badge when the cheapest super changes', async () => {
    // best_super (dia) !== current_best_super (vea) → cross-super comparison + badge
    const opp = makeOpportunity({ flips_super: true, current_best_super: 'vea' });
    mockCompare.mockResolvedValue(makeCompareResultWithOpportunity(opp));

    renderCart();

    // Wait for the Oportunidades section root to appear (compare loads on mount)
    await waitFor(() => expect(screen.getByTestId('opportunities-section')).toBeDefined());

    const section = screen.getByTestId('opportunities-section');

    // Section heading
    expect(section.textContent).toContain('Oportunidades');

    // Cross-super copy: "Agregá N más de <name> y te conviene <best> … vs … en <current>"
    expect(section.textContent).toContain('Agregá');
    expect(section.textContent).toContain('más de');
    expect(section.textContent).toContain('Oreo');
    expect(section.textContent).toContain('te conviene');

    // missing_units shown in the Agregar button copy
    expect(screen.getByRole('button', { name: /Agregar 1 para la promo/i })).toBeDefined();

    // Super name pills appear inside the nudge section
    expect(section.textContent).toMatch(/DIA/i);
    expect(section.textContent).toMatch(/VEA/i);

    // flips badge
    expect(screen.getByTestId('flips-badge')).toBeDefined();
    expect(screen.getByTestId('flips-badge').textContent).toContain('Cambia el súper más barato');
  });

  it('uses non-redundant promo-only copy when the cheapest super does not change', async () => {
    // best_super === current_best_super → showing "te conviene VEA vs VEA" is
    // redundant; the nudge must only announce that the promo activates.
    const opp = makeOpportunity({
      best_super: 'vea',
      current_best_super: 'vea',
      flips_super: false,
    });
    mockCompare.mockResolvedValue(makeCompareResultWithOpportunity(opp));

    renderCart();

    await waitFor(() => expect(screen.getByTestId('opportunities-section')).toBeDefined());
    const section = screen.getByTestId('opportunities-section');

    // Promo-activation phrasing, NOT the cross-super comparison
    expect(section.textContent).toContain('se activa la promo');
    expect(section.textContent).toContain('en vez de');
    expect(section.textContent).not.toContain('te conviene');
    // No "Cambia el súper más barato" badge when the super is unchanged
    expect(screen.queryByTestId('flips-badge')).toBeNull();
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

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Agregar 1 para la promo/i })).toBeDefined(),
    );
    expect(mockCompare).toHaveBeenCalledTimes(1);

    const btn = screen.getByRole('button', { name: /Agregar 1 para la promo/i });

    // Click to start the call
    act(() => {
      btn.click();
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

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Agregar 1 para la promo/i })).toBeDefined(),
    );

    act(() => {
      screen.getByRole('button', { name: /Agregar 1 para la promo/i }).click();
    });

    // After the rejection settles the button must be re-enabled (no loading state)
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Agregar 1 para la promo/i }).hasAttribute('disabled'),
      ).toBe(false),
    );
  });

  it('sorts nudge cards by projected savings descending', async () => {
    // Item A: saving = (1000 - 700) × 3 = 900
    const oppA: PromoOpportunity = makeOpportunity({
      shopping_id: 1,
      current_best_unit_price: 1000,
      effective_unit_price_at_target: 700,
      missing_units: 2,
      target_qty: 3,
      best_super: 'dia',
      current_best_super: 'vea',
      flips_super: true,
    });
    // Item B: saving = (800 - 600) × 2 = 400  (lower — should render second)
    const oppB: PromoOpportunity = makeOpportunity({
      shopping_id: 2,
      current_best_unit_price: 800,
      effective_unit_price_at_target: 600,
      missing_units: 1,
      target_qty: 2,
      best_super: 'carrefour',
      current_best_super: 'dia',
      flips_super: true,
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

    await waitFor(() => expect(screen.getByTestId('opportunities-section')).toBeDefined());

    const section = screen.getByTestId('opportunities-section');
    const nudgeButtons = section.querySelectorAll('button[type="button"]');

    // First nudge button should say "Agregar 2 para la promo" (item A — higher savings)
    expect(nudgeButtons[0]?.textContent).toContain('Agregar 2 para la promo');
    // Second nudge button should say "Agregar 1 para la promo" (item B — lower savings)
    expect(nudgeButtons[1]?.textContent).toContain('Agregar 1 para la promo');
  });

  it('does not render Oportunidades heading when all opportunity fields are null', async () => {
    mockCompare.mockResolvedValue(makeCompareResultWithOpportunity(null));

    renderCart();

    await waitFor(() => expect(screen.getByText('Opción A — Todo en un super')).toBeDefined());

    expect(screen.queryByText('Oportunidades')).toBeNull();
    expect(screen.queryByTestId('opportunities-section')).toBeNull();
  });
});

// ─── Task 8: Handoff button render tests ─────────────────────────────────────

/**
 * Build a CompareResult configured for handoff button testing.
 * Uses MISMATCHED quantities in fixtures to catch qty=1 hardcode bugs.
 */
function makeHandoffCompareResult(overrides: Partial<CompareResult> = {}): CompareResult {
  return {
    items: [
      {
        shopping_id: 1,
        name: 'Leche',
        home_super: 'vea',
        home_price: 1500,
        home_unit_price: 1500,
        home_promo_label: null,
        home_info_badges: [],
        matches: [
          {
            super: 'carrefour',
            product_id: 10,
            sku_id: 'sku-carrefour-1',
            name: 'Leche Carrefour',
            price: 1350,
            matched_by: 'barcode',
            available: true,
            unit_price: 1350,
            promo_label: null,
            info_badges: [],
          },
        ],
        opportunity: null,
      },
      {
        shopping_id: 2,
        name: 'Yogur',
        home_super: 'vea',
        home_price: 600,
        home_unit_price: 600,
        home_promo_label: null,
        home_info_badges: [],
        matches: [
          {
            super: 'carrefour',
            product_id: 20,
            sku_id: 'sku-carrefour-2',
            name: 'Yogur Carrefour',
            price: 580,
            matched_by: 'barcode',
            available: true,
            unit_price: 580,
            promo_label: null,
            info_badges: [],
          },
        ],
        opportunity: null,
      },
    ],
    option_a: [{ super: 'carrefour', total: 1930, coverage: 100, missing_items: 0 }],
    option_b: {
      total: 1930,
      by_super: [{ super: 'carrefour', total: 1930, coverage: 100, missing_items: 0 }],
      breakdown: [
        { shopping_id: 1, best_super: 'carrefour', price: 1350 },
        { shopping_id: 2, best_super: 'carrefour', price: 580 },
      ],
      savings_vs_option_a: 0,
    },
    ...overrides,
  };
}

describe('Cart handoff buttons', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // MISMATCHED quantities: item 1 qty=3, item 2 qty=1 — catches qty=1 hardcode
    mockItems = [
      makeItem({ cart_item_id: 1, quantity: 3, name: 'Leche' }),
      makeItem({ cart_item_id: 2, quantity: 1, name: 'Yogur' }),
    ];
    mockItemCount = 4;
  });

  // SC-5.1: Option A renders a handoff button for EVERY super in option_a (D1 reversed)
  it('SC-5.1: Option A renders a button per super (winner AND non-winner), each with correct URL', async () => {
    const result = makeHandoffCompareResult({
      option_a: [
        { super: 'carrefour', total: 1930, coverage: 100, missing_items: 0 },
        { super: 'dia', total: 2200, coverage: 100, missing_items: 0 },
      ],
      // Add dia matches so the dia button has non-null skus
      items: [
        {
          shopping_id: 1,
          name: 'Leche',
          home_super: 'vea',
          home_price: 1500,
          home_unit_price: 1500,
          home_promo_label: null,
          home_info_badges: [],
          matches: [
            {
              super: 'carrefour',
              product_id: 10,
              sku_id: 'sku-carrefour-1',
              name: 'Leche Carrefour',
              price: 1350,
              matched_by: 'barcode',
              available: true,
              unit_price: 1350,
              promo_label: null,
              info_badges: [],
            },
            {
              super: 'dia',
              product_id: 11,
              sku_id: 'sku-dia-1',
              name: 'Leche DIA',
              price: 1400,
              matched_by: 'barcode',
              available: true,
              unit_price: 1400,
              promo_label: null,
              info_badges: [],
            },
          ],
          opportunity: null,
        },
        {
          shopping_id: 2,
          name: 'Yogur',
          home_super: 'vea',
          home_price: 600,
          home_unit_price: 600,
          home_promo_label: null,
          home_info_badges: [],
          matches: [
            {
              super: 'carrefour',
              product_id: 20,
              sku_id: 'sku-carrefour-2',
              name: 'Yogur Carrefour',
              price: 580,
              matched_by: 'barcode',
              available: true,
              unit_price: 580,
              promo_label: null,
              info_badges: [],
            },
            {
              super: 'dia',
              product_id: 21,
              sku_id: 'sku-dia-2',
              name: 'Yogur DIA',
              price: 620,
              matched_by: 'barcode',
              available: true,
              unit_price: 620,
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

    // Both supers must get a button — compare loads on mount
    await waitFor(() => expect(screen.getByTestId('handoff-option-a-carrefour')).toBeDefined());
    expect(screen.getByTestId('handoff-option-a-dia')).toBeDefined();

    const carrefourBtn = screen.getByTestId('handoff-option-a-carrefour') as HTMLAnchorElement;
    const diaBtn = screen.getByTestId('handoff-option-a-dia') as HTMLAnchorElement;

    // Winner (carrefour) button → anchor with correct origin, its own skus, sc=1
    expect(carrefourBtn.tagName.toLowerCase()).toBe('a');
    expect(carrefourBtn.href).toContain('carrefour.com.ar');
    expect(carrefourBtn.href).toContain('sku-carrefour-1');
    expect(carrefourBtn.href).toContain('sc=1');
    expect(carrefourBtn.href).not.toContain('sc=34');

    // Non-winner (dia) button → anchor with correct origin and its own skus
    expect(diaBtn.tagName.toLowerCase()).toBe('a');
    expect(diaBtn.href).toContain('supermercadosdia.com.ar');
    expect(diaBtn.href).toContain('sku-dia-1');
    expect(diaBtn.href).toContain('sc=1');

    // No sku leakage across supers
    expect(carrefourBtn.href).not.toContain('sku-dia');
    expect(diaBtn.href).not.toContain('sku-carrefour');
  });

  // SC-5.3: Home-super winner works without special-casing
  it('SC-5.3: Home-super winner carries sku_id correctly, no special-casing', async () => {
    // dia is both the home super AND the option_a winner
    const result: CompareResult = {
      items: [
        {
          shopping_id: 1,
          name: 'Leche',
          home_super: 'dia',
          home_price: 900,
          home_unit_price: 900,
          home_promo_label: null,
          home_info_badges: [],
          matches: [
            {
              super: 'dia',
              product_id: 77,
              sku_id: 'dia-sku-55',
              name: 'Leche DIA',
              price: 900,
              matched_by: 'barcode',
              available: true,
              unit_price: 900,
              promo_label: null,
              info_badges: [],
            },
          ],
          opportunity: null,
        },
      ],
      option_a: [{ super: 'dia', total: 900, coverage: 100, missing_items: 0 }],
      option_b: {
        total: 900,
        by_super: [{ super: 'dia', total: 900, coverage: 100, missing_items: 0 }],
        breakdown: [{ shopping_id: 1, best_super: 'dia', price: 900 }],
        savings_vs_option_a: 0,
      },
    };
    mockItems = [makeItem({ cart_item_id: 1, quantity: 3, super: 'dia' })];
    mockItemCount = 3;
    mockCompare.mockResolvedValue(result);

    renderCart();

    await waitFor(() => expect(screen.getByTestId('handoff-option-a-dia')).toBeDefined());

    const handoffBtn = screen.getByTestId('handoff-option-a-dia');
    // Must be an anchor with href containing dia-sku-55
    expect(handoffBtn.tagName.toLowerCase()).toBe('a');
    expect((handoffBtn as HTMLAnchorElement).href).toContain('sku=dia-sku-55');
  });

  // SC-5.4: Button is inert when all sku_ids null for Option A winner
  it('SC-5.4: Button is inert (no href) when all sku_ids are null for the winner', async () => {
    const result = makeHandoffCompareResult({
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
              product_id: 10,
              sku_id: null, // null → button inert
              name: 'Leche Carrefour',
              price: 450,
              matched_by: 'barcode',
              available: true,
              unit_price: 450,
              promo_label: null,
              info_badges: [],
            },
          ],
          opportunity: null,
        },
      ],
      option_a: [{ super: 'carrefour', total: 450, coverage: 100, missing_items: 0 }],
    });
    mockItems = [makeItem({ cart_item_id: 1, quantity: 1 })];
    mockItemCount = 1;
    mockCompare.mockResolvedValue(result);

    renderCart();

    await waitFor(() => expect(screen.getByTestId('handoff-option-a-carrefour')).toBeDefined());

    const handoffEl = screen.getByTestId('handoff-option-a-carrefour');
    // Must be a span (inert), not an anchor
    expect(handoffEl.tagName.toLowerCase()).toBe('span');
    expect(handoffEl.hasAttribute('href')).toBe(false);
  });

  // SC-6.1: One button per Option B super
  it('SC-6.1: One Option B button per split super, no extra buttons', async () => {
    const result: CompareResult = {
      items: [
        {
          shopping_id: 1,
          name: 'Leche',
          home_super: 'vea',
          home_price: 600,
          home_unit_price: 600,
          home_promo_label: null,
          home_info_badges: [],
          matches: [
            {
              super: 'carrefour',
              product_id: 11,
              sku_id: '11',
              name: 'Leche Carrefour',
              price: 550,
              matched_by: 'barcode',
              available: true,
              unit_price: 550,
              promo_label: null,
              info_badges: [],
            },
          ],
          opportunity: null,
        },
        {
          shopping_id: 2,
          name: 'Yogur',
          home_super: 'vea',
          home_price: 400,
          home_unit_price: 400,
          home_promo_label: null,
          home_info_badges: [],
          matches: [
            {
              super: 'dia',
              product_id: 22,
              sku_id: '22',
              name: 'Yogur DIA',
              price: 380,
              matched_by: 'barcode',
              available: true,
              unit_price: 380,
              promo_label: null,
              info_badges: [],
            },
          ],
          opportunity: null,
        },
      ],
      option_a: [{ super: 'carrefour', total: 930, coverage: 100, missing_items: 0 }],
      option_b: {
        total: 930,
        by_super: [
          { super: 'carrefour', total: 550, coverage: 50, missing_items: 1 },
          { super: 'dia', total: 380, coverage: 50, missing_items: 1 },
        ],
        breakdown: [
          { shopping_id: 1, best_super: 'carrefour', price: 550 },
          { shopping_id: 2, best_super: 'dia', price: 380 },
        ],
        savings_vs_option_a: 0,
      },
    };
    mockCompare.mockResolvedValue(result);

    renderCart();

    await waitFor(() => expect(screen.getByTestId('handoff-option-b-carrefour')).toBeDefined());

    expect(screen.getByTestId('handoff-option-b-carrefour')).toBeDefined();
    expect(screen.getByTestId('handoff-option-b-dia')).toBeDefined();
    expect(screen.queryByTestId('handoff-option-b-vea')).toBeNull();
    expect(screen.queryByTestId('handoff-option-b-masonline')).toBeNull();

    // Option B explainer: 2-super split → "se divide en 2 supers"
    expect(document.body.textContent).toContain('se divide en 2 supers');
  });

  // SC-6.2: No cross-super sku leakage
  it('SC-6.2: Carrefour button URL contains sku=11 not sku=22; dia button vice versa', async () => {
    const result: CompareResult = {
      items: [
        {
          shopping_id: 1,
          name: 'Leche',
          home_super: 'vea',
          home_price: 600,
          home_unit_price: 600,
          home_promo_label: null,
          home_info_badges: [],
          matches: [
            {
              super: 'carrefour',
              product_id: 11,
              sku_id: '11',
              name: 'Leche Carrefour',
              price: 550,
              matched_by: 'barcode',
              available: true,
              unit_price: 550,
              promo_label: null,
              info_badges: [],
            },
          ],
          opportunity: null,
        },
        {
          shopping_id: 2,
          name: 'Yogur',
          home_super: 'vea',
          home_price: 400,
          home_unit_price: 400,
          home_promo_label: null,
          home_info_badges: [],
          matches: [
            {
              super: 'dia',
              product_id: 22,
              sku_id: '22',
              name: 'Yogur DIA',
              price: 380,
              matched_by: 'barcode',
              available: true,
              unit_price: 380,
              promo_label: null,
              info_badges: [],
            },
          ],
          opportunity: null,
        },
      ],
      option_a: [{ super: 'carrefour', total: 930, coverage: 100, missing_items: 0 }],
      option_b: {
        total: 930,
        by_super: [
          { super: 'carrefour', total: 550, coverage: 50, missing_items: 1 },
          { super: 'dia', total: 380, coverage: 50, missing_items: 1 },
        ],
        breakdown: [
          { shopping_id: 1, best_super: 'carrefour', price: 550 },
          { shopping_id: 2, best_super: 'dia', price: 380 },
        ],
        savings_vs_option_a: 0,
      },
    };
    mockCompare.mockResolvedValue(result);

    renderCart();

    await waitFor(() => expect(screen.getByTestId('handoff-option-b-carrefour')).toBeDefined());

    const carrefourBtn = screen.getByTestId('handoff-option-b-carrefour') as HTMLAnchorElement;
    const diaBtn = screen.getByTestId('handoff-option-b-dia') as HTMLAnchorElement;

    expect(carrefourBtn.href).toContain('sku=11');
    expect(carrefourBtn.href).not.toContain('sku=22');
    expect(diaBtn.href).toContain('sku=22');
    expect(diaBtn.href).not.toContain('sku=11');
  });

  // SC-7.1: Disclaimer present when compareResult loaded
  it('SC-7.1: Disclaimer text appears when handoff button renders', async () => {
    mockCompare.mockResolvedValue(makeHandoffCompareResult());

    renderCart();

    await waitFor(() => expect(screen.getByTestId('handoff-option-a-carrefour')).toBeDefined());

    expect(
      screen.getAllByText('Los precios pueden variar al momento de pagar.').length,
    ).toBeGreaterThan(0);
  });

  // SC-8.1: Partial count shown when some skus null
  it('SC-8.1: Partial count "2 de 3 productos" shown when one sku is null', async () => {
    const result: CompareResult = {
      items: [
        {
          shopping_id: 1,
          name: 'Item A',
          home_super: 'vea',
          home_price: 500,
          home_unit_price: 500,
          home_promo_label: null,
          home_info_badges: [],
          matches: [
            {
              super: 'carrefour',
              product_id: 10,
              sku_id: 'sku-a',
              name: 'Item A Carrefour',
              price: 480,
              matched_by: 'barcode',
              available: true,
              unit_price: 480,
              promo_label: null,
              info_badges: [],
            },
          ],
          opportunity: null,
        },
        {
          shopping_id: 2,
          name: 'Item B',
          home_super: 'vea',
          home_price: 400,
          home_unit_price: 400,
          home_promo_label: null,
          home_info_badges: [],
          matches: [
            {
              super: 'carrefour',
              product_id: 20,
              sku_id: 'sku-b',
              name: 'Item B Carrefour',
              price: 380,
              matched_by: 'barcode',
              available: true,
              unit_price: 380,
              promo_label: null,
              info_badges: [],
            },
          ],
          opportunity: null,
        },
        {
          shopping_id: 3,
          name: 'Item C',
          home_super: 'vea',
          home_price: 300,
          home_unit_price: 300,
          home_promo_label: null,
          home_info_badges: [],
          matches: [
            {
              super: 'carrefour',
              product_id: 30,
              sku_id: null, // null → excluded from URL
              name: 'Item C Carrefour',
              price: 290,
              matched_by: 'barcode',
              available: true,
              unit_price: 290,
              promo_label: null,
              info_badges: [],
            },
          ],
          opportunity: null,
        },
      ],
      option_a: [{ super: 'carrefour', total: 1150, coverage: 100, missing_items: 0 }],
      option_b: {
        total: 1150,
        by_super: [{ super: 'carrefour', total: 1150, coverage: 100, missing_items: 0 }],
        breakdown: [
          { shopping_id: 1, best_super: 'carrefour', price: 480 },
          { shopping_id: 2, best_super: 'carrefour', price: 380 },
          { shopping_id: 3, best_super: 'carrefour', price: 290 },
        ],
        savings_vs_option_a: 0,
      },
    };
    // 3 cart items with MISMATCHED quantities
    mockItems = [
      makeItem({ cart_item_id: 1, quantity: 3, name: 'Item A' }),
      makeItem({ cart_item_id: 2, quantity: 1, name: 'Item B' }),
      makeItem({ cart_item_id: 3, quantity: 2, name: 'Item C' }),
    ];
    mockItemCount = 6;
    mockCompare.mockResolvedValue(result);

    renderCart();

    await waitFor(() => expect(screen.getByTestId('handoff-option-a-carrefour')).toBeDefined());

    // 2 of 3 items linked → partial count disclosure (may appear in both Option A and B sections)
    expect(screen.getAllByText('2 de 3 productos').length).toBeGreaterThan(0);
  });

  // SC-8.2: No partial count when all items linked
  it('SC-8.2: No partial count text when all sku_ids non-null', async () => {
    mockCompare.mockResolvedValue(makeHandoffCompareResult());

    renderCart();

    await waitFor(() => expect(screen.getByTestId('handoff-option-a-carrefour')).toBeDefined());

    // "2 de 2" should NOT appear
    expect(screen.queryByText(/\d+ de \d+ productos/)).toBeNull();
  });

  // SC-9: VEA handoff uses the sc=34 sales channel (no misleading availability hint)
  it('SC-9: VEA handoff button uses the sc=34 sales channel when winner is vea', async () => {
    const result: CompareResult = {
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
              super: 'vea',
              product_id: 10,
              sku_id: 'vea-sku-1',
              name: 'Leche VEA',
              price: 480,
              matched_by: 'barcode',
              available: true,
              unit_price: 480,
              promo_label: null,
              info_badges: [],
            },
          ],
          opportunity: null,
        },
      ],
      option_a: [{ super: 'vea', total: 480, coverage: 100, missing_items: 0 }],
      option_b: {
        total: 480,
        by_super: [{ super: 'vea', total: 480, coverage: 100, missing_items: 0 }],
        breakdown: [{ shopping_id: 1, best_super: 'vea', price: 480 }],
        savings_vs_option_a: 0,
      },
    };
    mockItems = [makeItem({ cart_item_id: 1, quantity: 1 })];
    mockItemCount = 1;
    mockCompare.mockResolvedValue(result);

    renderCart();

    await waitFor(() => expect(screen.getByTestId('handoff-option-a-vea')).toBeDefined());

    const handoffBtn = screen.getByTestId('handoff-option-a-vea');
    // Enabled (anchor with href)
    expect(handoffBtn.tagName.toLowerCase()).toBe('a');
    expect((handoffBtn as HTMLAnchorElement).href).toContain('vea-sku-1');

    // No VEA-specific availability hint — our crawl is zone-aware, so claiming a
    // product "may not be available at your store" would contradict our own data.
    expect(document.body.textContent).not.toContain('no estar disponibles en tu sucursal');

    // VEA sales channel must be sc=34, NOT sc=1 (Cencosud VTEX channel)
    expect((handoffBtn as HTMLAnchorElement).href).toContain('sc=34');
    expect((handoffBtn as HTMLAnchorElement).href).not.toContain('sc=1');
  });

  // SC-8.3: all sku_ids null → inert button + "0 de N productos" indicator shown
  it('SC-8.3: inert button + "0 de N" count shown when all sku_ids null', async () => {
    const result: CompareResult = {
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
              product_id: 10,
              sku_id: null,
              name: 'Leche Carrefour',
              price: 450,
              matched_by: 'barcode',
              available: true,
              unit_price: 450,
              promo_label: null,
              info_badges: [],
            },
          ],
          opportunity: null,
        },
        {
          shopping_id: 2,
          name: 'Yogur',
          home_super: 'vea',
          home_price: 400,
          home_unit_price: 400,
          home_promo_label: null,
          home_info_badges: [],
          matches: [
            {
              super: 'carrefour',
              product_id: 20,
              sku_id: null,
              name: 'Yogur Carrefour',
              price: 380,
              matched_by: 'barcode',
              available: true,
              unit_price: 380,
              promo_label: null,
              info_badges: [],
            },
          ],
          opportunity: null,
        },
      ],
      option_a: [{ super: 'carrefour', total: 830, coverage: 100, missing_items: 0 }],
      option_b: {
        total: 830,
        by_super: [{ super: 'carrefour', total: 830, coverage: 100, missing_items: 0 }],
        breakdown: [
          { shopping_id: 1, best_super: 'carrefour', price: 450 },
          { shopping_id: 2, best_super: 'carrefour', price: 380 },
        ],
        savings_vs_option_a: 0,
      },
    };
    mockItems = [
      makeItem({ cart_item_id: 1, quantity: 1 }),
      makeItem({ cart_item_id: 2, quantity: 1, name: 'Yogur' }),
    ];
    mockItemCount = 2;
    mockCompare.mockResolvedValue(result);

    renderCart();

    await waitFor(() => expect(screen.getByTestId('handoff-option-a-carrefour')).toBeDefined());

    // Button must be inert (span, no href)
    const handoffEl = screen.getByTestId('handoff-option-a-carrefour');
    expect(handoffEl.tagName.toLowerCase()).toBe('span');
    expect(handoffEl.hasAttribute('href')).toBe(false);

    // "0 de 2 productos" transparency count must appear (SC-8.3)
    expect(screen.getAllByText('0 de 2 productos').length).toBeGreaterThan(0);
  });
});
