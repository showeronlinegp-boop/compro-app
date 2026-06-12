/**
 * promo-capture.service.ts — Playwright-based structured DOM extraction for bank promos.
 *
 * Launches Chromium, visits each promo target, extracts structured offer data,
 * parses it with domain functions, and persists via PromosRepo.
 */

import type Database from 'better-sqlite3';
import { chromium } from 'playwright';
import {
  bankFromLogo,
  parseDiscountPct,
  parseInstallments,
  parseInterestFree,
} from '../domain/parse.js';
import type { PromoOfferInput } from '../domain/types.js';
import { isCaptureRunning, markCaptureDone, markCaptureRunning } from './capture-state.js';
import { PROMO_TARGETS } from './promo-targets.js';
import { makePromosRepo } from './promos.repo.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PromoCaptureService {
  captureSuper(superKey: string): Promise<{ super: string; count: number }>;
  captureAll(): Promise<Array<{ super: string; count: number; error?: string }>>;
  isCapturing(superKey: string): boolean;
}

export interface PromoCaptureDeps {
  db: Database.Database;
}

// ---------------------------------------------------------------------------
// Raw extraction result shape (returned from page.evaluate — no imports there)
// ---------------------------------------------------------------------------

interface RawPromoItem {
  pct: string | null;
  desc: string | null;
  logoUrl: string | null;
  logoFile: string | null;
  imageUrl: string | null;
  validity: string | null;
}

// ---------------------------------------------------------------------------
// Desktop Chrome UA
// ---------------------------------------------------------------------------

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Create a browser context tuned for AR storefronts, with a shim that defines
 * esbuild's `__name` helper in the page world. tsx/tsup may emit `__name(...)`
 * calls inside functions we serialize into page.evaluate; without this shim
 * those calls throw `ReferenceError: __name is not defined` in the browser.
 */
async function newPromoContext(
  browser: import('playwright').Browser,
): Promise<import('playwright').BrowserContext> {
  const context = await browser.newContext({
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    viewport: { width: 1366, height: 1200 },
    userAgent: DESKTOP_UA,
  });
  await context.addInitScript(() => {
    const g = globalThis as unknown as { __name?: (fn: unknown) => unknown };
    if (!g.__name) g.__name = (fn) => fn;
  });
  return context;
}

/**
 * Lazy-load trigger: scroll to the bottom in steps, then back to top.
 * Written as a flat loop (no nested named functions) so esbuild's keepNames
 * helper (__name) is never emitted into the browser-serialized source.
 */
async function scrollPage(page: import('playwright').Page): Promise<void> {
  const docHeight = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < docHeight; y += 600) {
    await page.evaluate((to) => window.scrollTo(0, to), y);
    await sleep(200);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

// ---------------------------------------------------------------------------
// DOM extraction (runs inside page.evaluate — no imports, no closures over Node vars)
// ---------------------------------------------------------------------------

type ExtractFn = (classPrefix: string) => RawPromoItem[];

const extractValtech: ExtractFn = (p) => {
  const items: RawPromoItem[] = [];
  const cards = document.querySelectorAll(`[class*="${p}discount"]`);
  for (const el of Array.from(cards)) {
    const left = el.querySelector(`[class*="${p}ColLeftPercentageContainer"]`);
    const right = el.querySelector(`[class*="${p}ColRightCard"]`);
    const img = el.querySelector('img') as HTMLImageElement | null;
    const logoUrl = img?.currentSrc || img?.src || null;
    const pct = left?.textContent?.trim() ?? null;
    const desc = right?.textContent?.trim() ?? null;
    let logoFile: string | null = null;
    if (logoUrl) {
      try {
        const pathname = new URL(logoUrl).pathname;
        logoFile = pathname.split('/').filter(Boolean).pop() ?? null;
      } catch {
        logoFile = logoUrl.split('/').pop() ?? null;
      }
    }
    if (pct || desc) {
      items.push({ pct, desc, logoUrl, logoFile, imageUrl: null, validity: null });
    }
  }
  return items;
};

const extractVea: ExtractFn = (_p) => {
  const items: RawPromoItem[] = [];
  const seen = new Set<string>();

  const offerRe = /cuota|%|inter[eé]s|reintegro|descuento/i;
  const skipImgRe = /recaptcha|logo-modo|512e889|entrega|whatsapp/i;

  const imgs = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];

  for (const img of imgs) {
    const src = img.currentSrc || img.src || '';
    if (!src.match(/\.(png|webp)/i)) continue;
    if (skipImgRe.test(src)) continue;

    const rect = img.getBoundingClientRect();
    if (rect.width < 80 || rect.width > 260 || rect.height < 40) continue;

    // Climb up to 6 parents to find container with offer text
    let el: Element | null = img.parentElement;
    let text = '';
    for (let i = 0; i < 6; i++) {
      if (!el) break;
      const t = (el as HTMLElement).innerText?.trim() ?? '';
      if (offerRe.test(t) && t.length > 8) {
        text = t;
        break;
      }
      el = el.parentElement;
    }

    if (!text || !offerRe.test(text)) continue;

    let logoFile: string | null = null;
    try {
      const pathname = new URL(src).pathname;
      logoFile = pathname.split('/').filter(Boolean).pop() ?? null;
    } catch {
      logoFile = src.split('/').pop() ?? null;
    }

    const dedupeKey = (logoFile ?? '') + text.slice(0, 30);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    items.push({ pct: null, desc: text, logoUrl: src, logoFile, imageUrl: null, validity: null });
  }

  return items;
};

const extractDia: ExtractFn = (p) => {
  const items: RawPromoItem[] = [];
  const cardClass = `${p}card_detail`;
  const cards = Array.from(document.querySelectorAll(`[class*="${p}card_detail"]`)).filter((el) =>
    Array.from(el.classList).some((c) => c === cardClass),
  );

  for (const card of cards) {
    const imgEl =
      (card.querySelector(`[class*="${p}card_detail__image"] img`) as HTMLImageElement | null) ??
      (card.querySelector('img') as HTMLImageElement | null);
    const imageUrl = imgEl?.currentSrc || imgEl?.src || null;
    const flagEls = Array.from(card.querySelectorAll(`[class*="${p}card_detail__flags_item"]`));
    const validity =
      flagEls
        .map((f) => f.textContent?.trim())
        .filter(Boolean)
        .join(', ') || null;

    if (imageUrl) {
      items.push({ pct: null, desc: null, logoUrl: null, logoFile: null, imageUrl, validity });
    }
  }

  return items;
};

// ---------------------------------------------------------------------------
// Map raw extraction result to PromoOfferInput using domain parsers
// ---------------------------------------------------------------------------

function mapRawToInput(raw: RawPromoItem, kind: 'valtech' | 'vea' | 'dia'): PromoOfferInput {
  if (kind === 'dia') {
    // Image-only card
    return {
      bank: null,
      title: null,
      description: null,
      discountPct: null,
      installments: null,
      interestFree: null,
      logoUrl: null,
      imageUrl: raw.imageUrl,
      validity: raw.validity,
    };
  }

  const combinedText = [raw.pct, raw.desc].filter(Boolean).join(' ');

  // For valtech: title is the pct text (e.g. "20%"), condensed to one line
  // For vea: title is first meaningful line of desc
  let title: string | null = null;
  let description: string | null = null;

  if (kind === 'valtech') {
    // Valtech pct text (e.g. "20%") is already carried by the badge (discountPct/
    // installments) and repeated in the description, so leave title null to avoid
    // showing the same "20%" three times on the card.
    title = null;
    description = raw.desc ?? null;
  } else {
    // vea — split desc into title (first line/sentence up to 80 chars) + rest
    const fullText = raw.desc ?? '';
    const firstBreak = fullText.search(/\n|\.(?=\s)|(?:Exclusivo|PROMOCIÓN|VÁLID)/);
    if (firstBreak > 0 && firstBreak < 80) {
      title = fullText.slice(0, firstBreak).trim();
      description = fullText.slice(firstBreak).trim();
    } else {
      // Fallback: first 60 chars as title
      const cut = Math.min(60, fullText.length);
      title = fullText.slice(0, cut).trim() || null;
      description = fullText.slice(cut).trim() || null;
    }
  }

  const bank = bankFromLogo(raw.logoFile);
  const discountPct = combinedText ? parseDiscountPct(combinedText) : null;
  const installments = combinedText ? parseInstallments(combinedText) : null;
  const interestFree = combinedText ? parseInterestFree(combinedText) : null;

  return {
    bank,
    title,
    description,
    discountPct,
    installments,
    interestFree,
    logoUrl: raw.logoUrl,
    imageUrl: null,
    validity: raw.validity,
  };
}

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

export function makePromoCaptureService(deps: PromoCaptureDeps): PromoCaptureService {
  const repo = makePromosRepo(deps.db);

  async function captureOne(
    superKey: string,
    _browser: import('playwright').Browser,
    context: import('playwright').BrowserContext,
  ): Promise<{ super: string; count: number; error?: string }> {
    const target = PROMO_TARGETS[superKey];
    if (!target) {
      console.warn(`[promo:${superKey}] No target defined — skipping`);
      return { super: superKey, count: 0, error: 'No target defined' };
    }

    const page = await context.newPage();
    try {
      await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await sleep(4500);
      await scrollPage(page);
      await sleep(1200);

      let rawItems: RawPromoItem[] = [];

      if (target.kind === 'valtech') {
        const prefix = target.classPrefix ?? '';
        rawItems = await page.evaluate(extractValtech, prefix);
      } else if (target.kind === 'vea') {
        rawItems = await page.evaluate(extractVea, '');
      } else if (target.kind === 'dia') {
        const prefix = target.classPrefix ?? '';
        rawItems = await page.evaluate(extractDia, prefix);
      }

      if (rawItems.length === 0) {
        console.warn(`[promo:${superKey}] 0 items extracted — check selectors`);
      }

      const inputs: PromoOfferInput[] = rawItems.map((raw) => mapRawToInput(raw, target.kind));
      repo.replaceForSuper(superKey, inputs, target.url);

      console.log(`[promo:${superKey}] ${inputs.length} offers captured`);
      return { super: superKey, count: inputs.length };
    } catch (err) {
      const msg = (err as Error).message;
      console.error(`[promo:${superKey}] Error:`, msg);
      return { super: superKey, count: 0, error: msg };
    } finally {
      await page.close();
    }
  }

  async function captureSuper(superKey: string): Promise<{ super: string; count: number }> {
    if (isCaptureRunning(superKey)) throw new Error(`Capture for ${superKey} already in progress`);

    markCaptureRunning(superKey);
    const browser = await chromium.launch();
    const context = await newPromoContext(browser);

    try {
      const result = await captureOne(superKey, browser, context);
      return { super: result.super, count: result.count };
    } finally {
      await context.close();
      await browser.close();
      markCaptureDone(superKey);
    }
  }

  async function captureAll(): Promise<Array<{ super: string; count: number; error?: string }>> {
    const keys = Object.keys(PROMO_TARGETS);
    const results: Array<{ super: string; count: number; error?: string }> = [];

    const browser = await chromium.launch();
    const context = await newPromoContext(browser);

    try {
      for (const key of keys) {
        markCaptureRunning(key);
        try {
          const result = await captureOne(key, browser, context);
          results.push(result);
        } finally {
          markCaptureDone(key);
        }
      }
    } finally {
      await context.close();
      await browser.close();
    }

    return results;
  }

  return {
    captureSuper,
    captureAll,
    isCapturing: isCaptureRunning,
  };
}
