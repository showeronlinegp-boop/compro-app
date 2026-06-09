/**
 * promotions-client.test.ts — Unit tests for fetchPromoPrice URL resolution
 * and PromoFetchOutcome classification.
 *
 * Uses vi.stubGlobal to stub fetch — no real network.
 *
 * Covers:
 *   - Relative URL + baseUrl resolves to correct absolute URL
 *   - Already-absolute URL is unchanged when baseUrl provided
 *   - Non-2xx HTTP response → fetch_error
 *   - HTML without ld+json offers block → no_data
 *   - HTML with offers.lowPrice → found with correct promoPrice
 *   - Network throw (TypeError) → fetch_error
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPromoPrice } from './promotions-client.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeResponse(ok: boolean, status: number, body: string): Response {
  return {
    ok,
    status,
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

const HTML_WITH_PROMO = `<html><head>
  <script type="application/ld+json">
    {"@type":"Product","offers":{"lowPrice":1343}}
  </script>
</head></html>`;

const HTML_NO_PROMO = `<html><head>
  <script type="application/ld+json">
    {"@type":"BreadcrumbList","itemListElement":[]}
  </script>
</head></html>`;

const HTML_EMPTY = '<html><head></head><body></body></html>';

// ── tests ─────────────────────────────────────────────────────────────────────

describe('fetchPromoPrice — URL resolution', () => {
  let fetchStub: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchStub = vi.fn();
    vi.stubGlobal('fetch', fetchStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves a relative productUrl against baseUrl before fetching', async () => {
    fetchStub.mockResolvedValue(makeResponse(true, 200, HTML_WITH_PROMO));

    await fetchPromoPrice(
      '/salsa-...-100081/p',
      'https://diaonline.supermercadosdia.com.ar',
    );

    expect(fetchStub).toHaveBeenCalledOnce();
    const calledUrl = fetchStub.mock.calls[0]?.[0] as string;
    expect(calledUrl).toBe(
      'https://diaonline.supermercadosdia.com.ar/salsa-...-100081/p',
    );
  });

  it('leaves an already-absolute URL unchanged when baseUrl is provided', async () => {
    fetchStub.mockResolvedValue(makeResponse(true, 200, HTML_WITH_PROMO));

    await fetchPromoPrice(
      'https://diaonline.supermercadosdia.com.ar/product/p',
      'https://diaonline.supermercadosdia.com.ar',
    );

    const calledUrl = fetchStub.mock.calls[0]?.[0] as string;
    expect(calledUrl).toBe('https://diaonline.supermercadosdia.com.ar/product/p');
  });

  it('works without baseUrl when productUrl is already absolute', async () => {
    fetchStub.mockResolvedValue(makeResponse(true, 200, HTML_WITH_PROMO));

    await fetchPromoPrice('https://diaonline.supermercadosdia.com.ar/product/p');

    const calledUrl = fetchStub.mock.calls[0]?.[0] as string;
    expect(calledUrl).toBe('https://diaonline.supermercadosdia.com.ar/product/p');
  });
});

describe('fetchPromoPrice — outcome classification', () => {
  let fetchStub: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchStub = vi.fn();
    vi.stubGlobal('fetch', fetchStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns fetch_error when HTTP response is non-2xx (404)', async () => {
    fetchStub.mockResolvedValue(makeResponse(false, 404, ''));

    const outcome = await fetchPromoPrice(
      '/product/p',
      'https://diaonline.supermercadosdia.com.ar',
    );

    expect(outcome.kind).toBe('fetch_error');
  });

  it('returns fetch_error when HTTP response is non-2xx (500)', async () => {
    fetchStub.mockResolvedValue(makeResponse(false, 500, ''));

    const outcome = await fetchPromoPrice(
      '/product/p',
      'https://diaonline.supermercadosdia.com.ar',
    );

    expect(outcome.kind).toBe('fetch_error');
  });

  it('returns fetch_error when fetch throws (network error / TypeError)', async () => {
    fetchStub.mockRejectedValue(new TypeError('Failed to parse URL'));

    const outcome = await fetchPromoPrice(
      '/product/p',
      'https://diaonline.supermercadosdia.com.ar',
    );

    expect(outcome.kind).toBe('fetch_error');
  });

  it('returns no_data when HTML has no ld+json offers block', async () => {
    fetchStub.mockResolvedValue(makeResponse(true, 200, HTML_NO_PROMO));

    const outcome = await fetchPromoPrice(
      '/product/p',
      'https://diaonline.supermercadosdia.com.ar',
    );

    expect(outcome.kind).toBe('no_data');
  });

  it('returns no_data for empty HTML (no ld+json at all)', async () => {
    fetchStub.mockResolvedValue(makeResponse(true, 200, HTML_EMPTY));

    const outcome = await fetchPromoPrice(
      '/product/p',
      'https://diaonline.supermercadosdia.com.ar',
    );

    expect(outcome.kind).toBe('no_data');
  });

  it('returns found with correct promoPrice when offers.lowPrice present', async () => {
    fetchStub.mockResolvedValue(makeResponse(true, 200, HTML_WITH_PROMO));

    const outcome = await fetchPromoPrice(
      '/product/p',
      'https://diaonline.supermercadosdia.com.ar',
    );

    expect(outcome.kind).toBe('found');
    if (outcome.kind === 'found') {
      expect(outcome.result.promoPrice).toBe(1343);
      expect(outcome.result.listPrice).toBeNull();
    }
  });

  it('returns found with correct promoPrice when offers.price present', async () => {
    const htmlWithPrice = `<html><head>
      <script type="application/ld+json">
        {"@type":"Product","offers":{"price":999,"priceSpecification":{"price":1200}}}
      </script>
    </head></html>`;
    fetchStub.mockResolvedValue(makeResponse(true, 200, htmlWithPrice));

    const outcome = await fetchPromoPrice(
      '/product/p',
      'https://diaonline.supermercadosdia.com.ar',
    );

    expect(outcome.kind).toBe('found');
    if (outcome.kind === 'found') {
      expect(outcome.result.promoPrice).toBe(999);
      expect(outcome.result.listPrice).toBe(1200);
    }
  });
});
