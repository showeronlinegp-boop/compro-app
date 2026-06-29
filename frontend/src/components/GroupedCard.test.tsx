import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '../types/api';
import GroupedCard from './GroupedCard';

// Stub leaf children that pull app context / assets — we test GroupedCard's own logic.
vi.mock('./AddToCartButton', () => ({ default: () => <button type="button">+ Carrito</button> }));
vi.mock('./ProductImage', () => ({ default: () => <div /> }));

afterEach(cleanup);

function variant(over: Partial<Product>): Product {
  return {
    id: over.id ?? 1,
    super: over.super ?? 'dia',
    product_id: over.product_id ?? String(over.id ?? 1),
    sku_id: null,
    name: over.name ?? 'Tapas Para Tarta',
    barcode: over.barcode ?? '779',
    image_url: null,
    product_url: null,
    raw_price: over.raw_price ?? 1000,
    offer_price: over.offer_price ?? null,
    discount_pct: 0,
    available: over.available ?? true,
    categories: [],
    promotions: [],
    synced_at: '2026-06-28T00:00:00Z',
    category_key: 'lacteos',
  };
}

const group = (variants: Product[]) => ({
  key: '779',
  barcode: '779',
  name: 'Tapas Para Tarta',
  image_url: null,
  super_count: variants.length,
  variants,
});

describe('GroupedCard out-of-stock handling', () => {
  it('shows a sin-stock notice for an out-of-stock VEA variant', () => {
    render(
      <GroupedCard
        group={group([
          variant({ id: 1, super: 'dia', raw_price: 2735 }),
          variant({ id: 2, super: 'vea', raw_price: 4107.19, available: false }),
        ])}
      />,
    );
    expect(screen.getByText(/Sin stock en VEA/i)).toBeTruthy();
  });

  it('shows the OOS price as-is (raw_price) and never a discount, even if data carries offer_price', () => {
    // A stale enrichment could leave offer_price set on an out-of-stock row — the
    // card must still show the shelf price (raw_price) the super's page shows.
    const { container } = render(
      <GroupedCard
        group={group([
          variant({ id: 1, super: 'dia', raw_price: 2735 }),
          variant({ id: 2, super: 'vea', raw_price: 4107.19, offer_price: 2546.46, available: false }),
        ])}
      />,
    );
    // No strike-through anywhere for the OOS VEA row.
    expect(container.querySelector('.line-through')).toBeNull();
    // The phantom discounted price must not appear.
    expect(screen.queryByText(/2\.546/)).toBeNull();
    expect(screen.getByText(/4\.107/)).toBeTruthy();
  });

  it('never awards the ✓ best-price badge to an out-of-stock variant, even if cheapest', () => {
    // VEA is the cheapest number but is out of stock → DIA (in stock) must win.
    const { container } = render(
      <GroupedCard
        group={group([
          variant({ id: 1, super: 'vea', raw_price: 1689.5, available: false }),
          variant({ id: 2, super: 'dia', raw_price: 2735, available: true }),
        ])}
      />,
    );
    // Exactly one ✓, and the highlighted (best) row is DIA — not the cheaper OOS VEA.
    expect(screen.getAllByText('✓')).toHaveLength(1);
    const bestRow = container.querySelector('.bg-green-50');
    expect(bestRow?.textContent).toContain('DIA');
    expect(bestRow?.textContent).not.toContain('VEA');
  });
});
