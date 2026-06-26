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
    const struck = document.querySelector('.line-through');
    expect(struck).not.toBeNull();
    // The struck element should contain the shelf total value
    expect(struck?.textContent).toContain('4.940');
  });

  it('hides strike-through when unit_price === price', () => {
    render(<ItemMatchTable items={[makeItem({ unit_price: 3198, price: 3198 })]} />);
    const struck = document.querySelector('.line-through');
    expect(struck).toBeNull();
  });

  it('renders amber badge with promo_label text', () => {
    render(<ItemMatchTable items={[makeItem({ promo_label: '2do al 80%' })]} />);
    const badge = screen.getByText(/2do al 80%/);
    expect(badge).toBeDefined();
    expect(badge.className).toContain('text-amber-700');
  });

  it('does not render amber badge when promo_label is null', () => {
    render(<ItemMatchTable items={[makeItem({ promo_label: null })]} />);
    const amberSpans = document.querySelectorAll('.text-amber-700');
    expect(amberSpans.length).toBe(0);
  });

  it('renders a violet pill for each info_badge entry', () => {
    render(<ItemMatchTable items={[makeItem({ info_badges: ['Cuotas sin interés', '3x2'] })]} />);
    expect(screen.getByText(/Cuotas sin interés/)).toBeDefined();
    expect(screen.getByText(/3x2/)).toBeDefined();
    const violetSpans = document.querySelectorAll('.text-violet-700');
    expect(violetSpans.length).toBe(2);
  });

  it('renders no violet pills when info_badges is empty', () => {
    render(<ItemMatchTable items={[makeItem({ info_badges: [] })]} />);
    const violetSpans = document.querySelectorAll('.text-violet-700');
    expect(violetSpans.length).toBe(0);
  });
});
