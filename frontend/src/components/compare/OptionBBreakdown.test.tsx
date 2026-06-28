import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { CompareItem, CompareResult, SuperMatch } from '../../types/api';
import { OptionBBreakdown } from './OptionBBreakdown';

afterEach(() => {
  cleanup();
});

// ─── Factories ────────────────────────────────────────────────────────────────

function makeMatch(overrides: Partial<SuperMatch> = {}): SuperMatch {
  return {
    super: 'dia',
    product_id: 2,
    sku_id: null,
    name: 'Leche DIA',
    price: 2964,
    matched_by: 'barcode',
    unit_price: 4940,
    promo_label: null,
    info_badges: [],
    ...overrides,
  };
}

function makeItems(matchOverrides: Partial<SuperMatch> = {}): CompareItem[] {
  return [
    {
      shopping_id: 1,
      name: 'Leche',
      home_super: 'vea',
      home_price: 5000,
      home_unit_price: 5000,
      home_promo_label: null,
      home_info_badges: [],
      matches: [makeMatch(matchOverrides)],
      opportunity: null,
    },
  ];
}

function makeOptionB(
  overrides: Partial<CompareResult['option_b']> = {},
): CompareResult['option_b'] {
  return {
    total: 2964,
    by_super: [{ super: 'dia', total: 2964, coverage: 100, missing_items: 0 }],
    breakdown: [{ shopping_id: 1, best_super: 'dia', price: 2964 }],
    savings_vs_option_a: 2036,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OptionBBreakdown — promo badge on winning row', () => {
  it('shows promo_label amber badge on the winning breakdown row', () => {
    const items = makeItems({ promo_label: '2do al 80%' });
    const optionB = makeOptionB();

    render(<OptionBBreakdown result={optionB} items={items} />);

    const badge = screen.getByTestId('promo-badge');
    expect(badge).toBeDefined();
    expect(badge.textContent).toContain('2do al 80%');
    expect(badge.getAttribute('aria-label')).toContain('2do al 80%');
  });

  it('does not render amber badge when promo_label is null', () => {
    const items = makeItems({ promo_label: null });
    const optionB = makeOptionB();

    render(<OptionBBreakdown result={optionB} items={items} />);

    expect(screen.queryByTestId('promo-badge')).toBeNull();
  });
});
