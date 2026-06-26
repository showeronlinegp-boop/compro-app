import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { CompareItem, SuperMatch } from '../../types/api';
import { ItemMatchTable } from './ItemMatchTable';

afterEach(() => {
  cleanup();
});

// ─── Factories ────────────────────────────────────────────────────────────────

function makeMatch(overrides: Partial<SuperMatch> = {}): SuperMatch {
  return {
    super: 'carrefour',
    product_id: 1,
    name: 'Leche entera',
    price: 3198,
    matched_by: 'barcode',
    unit_price: 3198,
    promo_label: null,
    info_badges: [],
    ...overrides,
  };
}

function makeItem(matchOverrides: Partial<SuperMatch> = {}): CompareItem {
  return {
    shopping_id: 1,
    name: 'Leche',
    home_super: 'vea',
    home_price: 3198,
    home_unit_price: 3198,
    home_promo_label: null,
    home_info_badges: [],
    matches: [makeMatch(matchOverrides)],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ItemMatchTable — badge rendering', () => {
  it('shows strike-through when unit_price !== price', () => {
    render(<ItemMatchTable items={[makeItem({ unit_price: 4940, price: 2964 })]} />);
    const struck = screen.getByTestId('shelf-strike');
    expect(struck).toBeDefined();
    expect(struck.textContent).toContain('4.940');
  });

  it('hides strike-through when unit_price === price', () => {
    render(<ItemMatchTable items={[makeItem({ unit_price: 3198, price: 3198 })]} />);
    expect(screen.queryByTestId('shelf-strike')).toBeNull();
  });

  it('renders amber badge with promo_label text', () => {
    render(<ItemMatchTable items={[makeItem({ promo_label: '2do al 80%' })]} />);
    const badge = screen.getByTestId('promo-badge');
    expect(badge).toBeDefined();
    expect(badge.textContent).toContain('2do al 80%');
    expect(badge.getAttribute('aria-label')).toContain('2do al 80%');
  });

  it('does not render amber badge when promo_label is null', () => {
    render(<ItemMatchTable items={[makeItem({ promo_label: null })]} />);
    expect(screen.queryByTestId('promo-badge')).toBeNull();
  });

  it('renders a violet pill for each info_badge entry', () => {
    render(<ItemMatchTable items={[makeItem({ info_badges: ['Cuotas sin interés', '3x2'] })]} />);
    const pills = screen.getAllByTestId('info-badge');
    expect(pills).toHaveLength(2);
    // biome-ignore lint/style/noNonNullAssertion: length asserted above
    expect(pills[0]!.textContent).toContain('Cuotas sin interés');
    // biome-ignore lint/style/noNonNullAssertion: length asserted above
    expect(pills[1]!.textContent).toContain('3x2');
  });

  it('renders no violet pills when info_badges is empty', () => {
    render(<ItemMatchTable items={[makeItem({ info_badges: [] })]} />);
    expect(screen.queryAllByTestId('info-badge')).toHaveLength(0);
  });
});
