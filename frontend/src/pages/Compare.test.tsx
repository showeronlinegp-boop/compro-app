import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompareResult, PromoOpportunity } from '../types/api';

// ─── Mock api ─────────────────────────────────────────────────────────────────

const mockShoppingCompare = vi.fn<() => Promise<CompareResult>>();

vi.mock('../api', () => ({
  api: {
    shopping: {
      compare: () => mockShoppingCompare(),
    },
  },
}));

// ─── Import component AFTER mocks ─────────────────────────────────────────────

import Compare from './Compare';

// Helper: wrap in MemoryRouter so Link components never crash
function renderCompare() {
  return render(
    <MemoryRouter>
      <Compare />
    </MemoryRouter>,
  );
}

// ─── Factories ────────────────────────────────────────────────────────────────

function makeOpportunity(): PromoOpportunity {
  return {
    shopping_id: 1,
    missing_units: 1,
    target_qty: 2,
    best_super: 'dia',
    best_product_id: 42,
    effective_unit_price_at_target: 800,
    current_best_unit_price: 1000,
    current_best_super: 'vea',
    flips_super: true,
    promo_label: '2do al 80%',
  };
}

function makeCompareResult(opportunity: PromoOpportunity | null = null): CompareResult {
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
            unit_price: 1000,
            promo_label: '2do al 80%',
            info_badges: [],
          },
        ],
        opportunity,
      },
    ],
    option_a: [{ super: 'dia', total: 800, coverage: 100, missing_items: 0 }],
    option_b: {
      total: 800,
      by_super: [{ super: 'dia', total: 800, coverage: 100, missing_items: 0 }],
      breakdown: [{ shopping_id: 1, best_super: 'dia', price: 800 }],
      savings_vs_option_a: 200,
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Planner Compare page — Oportunidades non-regression', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render an Oportunidades section even when CompareItems carry a non-null opportunity', async () => {
    // The Oportunidades / PromoNudge section is cart-only (Cart.tsx).
    // The Planner Compare page must never render it regardless of opportunity data.
    mockShoppingCompare.mockResolvedValue(makeCompareResult(makeOpportunity()));

    renderCompare();

    // Wait for loading to finish (Option A heading appears when data loads)
    await waitFor(() => expect(screen.getByText('Opción A — Todo en un super')).toBeDefined());

    expect(screen.queryByText('Oportunidades')).toBeNull();
    expect(screen.queryByTestId('opportunities-section')).toBeNull();
    expect(screen.queryByRole('button', { name: /Agregar/i })).toBeNull();
  });
});

// ─── Detalle tab — ItemMatchTable renders per-product price table ─────────────

describe('Compare page — Detalle tab shows ItemMatchTable', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('switching to Detalle tab renders the per-product price table', async () => {
    mockShoppingCompare.mockResolvedValue(makeCompareResult());

    renderCompare();

    // Wait for options tab to be loaded
    await waitFor(() => expect(screen.getByText('Opción A — Todo en un super')).toBeDefined());

    // Switch to Detalle tab
    const detalleBtn = screen.getByRole('button', { name: /Detalle/i });
    act(() => {
      fireEvent.click(detalleBtn);
    });

    // ItemMatchTable renders a table with the aria-label defined in the component
    await waitFor(() =>
      expect(
        screen.getByRole('table', { name: 'Precios por producto y supermercado' }),
      ).toBeDefined(),
    );

    // The product name from the fixture appears as a row header
    expect(screen.getByText('Oreo')).toBeDefined();
  });
});
