import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { CompareItem, Promotion, SourceRow, SuperMatch } from '../../../shared/types.js';
import {
  collectInfoBadges,
  effectiveLineTotal,
  pickBestNthUnitPromo,
} from '../domain/promo-math.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tryParse<T>(v: unknown[] | string | null | undefined): T[] {
  if (v === null || v === undefined) return [];
  if (Array.isArray(v)) return v as T[];
  try {
    return JSON.parse(v as string) as T[];
  } catch {
    return [];
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── Internal row types ───────────────────────────────────────────────────────

interface ProductBaseRow {
  product_id: number;
  name: string;
  home_super: string;
  barcode: string | null;
  category_key: string | null;
  // Guaranteed non-null by the COALESCE(...) IS NOT NULL SQL filter.
  home_price: number;
  home_promotions: unknown[] | null;
}

interface MatchRow {
  product_id: number;
  match_product_id: number;
  match_super: string;
  match_name: string;
  match_price: number;
  matched_by: 'barcode' | 'name_similarity';
  match_promotions: unknown[] | null;
}

interface ShoppingRow {
  shopping_id: number;
  product_id: number;
}

// Internal extended type that carries promotions pre-dedup
interface UnitMatch extends SuperMatch {
  _promotions: Promotion[];
}

// ─── Repo interface ───────────────────────────────────────────────────────────

export interface CompareRepo {
  buildCompareItems(): Promise<CompareItem[]>;
  buildCompareItemsFromSource(source: SourceRow[]): Promise<CompareItem[]>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function makeCompareRepo(prisma: PrismaClient): CompareRepo {
  return {
    async buildCompareItemsFromSource(source: SourceRow[]): Promise<CompareItem[]> {
      if (source.length === 0) return [];

      const productIds = [...new Set(source.map((s) => s.product_id))];

      // Load base product rows (anchor on p.id IN product_ids)
      const baseRows = await prisma.$queryRaw<ProductBaseRow[]>(Prisma.sql`
        SELECT
          p.id AS product_id,
          p.name,
          p.super AS home_super,
          p.barcode,
          p.category_key,
          COALESCE(p.offer_price, p.raw_price) AS home_price,
          p.promotions AS home_promotions
        FROM products p
        WHERE p.id IN (${Prisma.join(productIds)})
          AND COALESCE(p.offer_price, p.raw_price) IS NOT NULL
      `);

      if (baseRows.length === 0) return [];

      // Build product_id → base row map
      const baseByProductId = new Map<number, ProductBaseRow>();
      for (const r of baseRows) {
        baseByProductId.set(Number(r.product_id), r);
      }

      // ── Barcode matching (exact, cross-super) ──────────────────────────────

      const barcodeMatches = await prisma.$queryRaw<MatchRow[]>(Prisma.sql`
        SELECT
          p.id AS product_id,
          p2.id AS match_product_id,
          p2.super AS match_super,
          p2.name AS match_name,
          COALESCE(p2.offer_price, p2.raw_price) AS match_price,
          'barcode' AS matched_by,
          p2.promotions AS match_promotions
        FROM products p
        JOIN products p2 ON p2.barcode = p.barcode
                         AND p2.barcode IS NOT NULL
                         AND p2.barcode != ''
                         AND p2.super != p.super
                         AND p2.available = true
                         AND COALESCE(p2.offer_price, p2.raw_price) IS NOT NULL
        WHERE p.id IN (${Prisma.join(productIds)})
      `);

      // product_ids that already have barcode matches (at least one super)
      const withBarcodeMatch = new Set(barcodeMatches.map((r) => Number(r.product_id)));

      // ── Name similarity matching for products without barcode matches ──────

      const productIdsNeedingSimilarity = productIds.filter(
        (pid) => !withBarcodeMatch.has(pid) && baseByProductId.get(pid)?.category_key,
      );

      let similarityMatches: MatchRow[] = [];

      if (productIdsNeedingSimilarity.length > 0) {
        similarityMatches = await prisma.$queryRaw<MatchRow[]>(Prisma.sql`
          SELECT DISTINCT ON (p.id, p2.super)
            p.id AS product_id,
            p2.id AS match_product_id,
            p2.super AS match_super,
            p2.name AS match_name,
            COALESCE(p2.offer_price, p2.raw_price) AS match_price,
            'name_similarity' AS matched_by,
            p2.promotions AS match_promotions
          FROM products p
          JOIN products p2
            ON p2.super != p.super
           AND p2.available = true
           AND p2.category_key = p.category_key
           AND p2.category_key IS NOT NULL
           AND COALESCE(p2.offer_price, p2.raw_price) IS NOT NULL
           AND similarity(
                 regexp_replace(lower(immutable_unaccent(p.name)), '[^a-z0-9]+', ' ', 'g'),
                 regexp_replace(lower(immutable_unaccent(p2.name)), '[^a-z0-9]+', ' ', 'g')
               ) > 0.35
          WHERE p.id IN (${Prisma.join(productIdsNeedingSimilarity)})
          ORDER BY p.id, p2.super,
            similarity(
              regexp_replace(lower(immutable_unaccent(p.name)), '[^a-z0-9]+', ' ', 'g'),
              regexp_replace(lower(immutable_unaccent(p2.name)), '[^a-z0-9]+', ' ', 'g')
            ) DESC
        `);
      }

      const allMatches = [...barcodeMatches, ...similarityMatches];

      // ── Build product_id → UnitMatch[] map (unit prices, pre-dedup) ─────────

      const matchesByProductId = new Map<number, UnitMatch[]>();
      for (const m of allMatches) {
        const pid = Number(m.product_id);
        const list = matchesByProductId.get(pid) ?? [];
        list.push({
          super: m.match_super,
          product_id: Number(m.match_product_id),
          name: m.match_name,
          price: Number(m.match_price), // shelf UNIT price — effective computed after dedup
          matched_by: m.matched_by,
          _promotions: tryParse<Promotion>(m.match_promotions),
          // new SuperMatch fields — filled in during per-source loop below
          unit_price: 0,
          promo_label: null,
          info_badges: [],
        });
        matchesByProductId.set(pid, list);
      }

      // ── Iterate source rows — one CompareItem per SourceRow ─────────────────

      const result: CompareItem[] = [];

      for (const s of source) {
        const base = baseByProductId.get(s.product_id);
        if (!base) continue; // product has no priced row — skip silently

        // Clamp quantity defensively — bad DB values must not corrupt totals.
        const qty = Math.max(1, Math.floor(Number(s.quantity) || 1));
        const unitHomePrice = Number(base.home_price);
        const homePromos = tryParse<Promotion>(base.home_promotions);
        const externalUnitMatches = matchesByProductId.get(s.product_id) ?? [];

        // Home as UnitMatch (always included in dedup pool)
        const homeUnitMatch: UnitMatch = {
          super: base.home_super,
          product_id: s.product_id,
          name: base.name,
          price: unitHomePrice, // shelf UNIT price — effective computed after dedup
          matched_by: 'barcode',
          _promotions: homePromos,
          unit_price: 0,
          promo_label: null,
          info_badges: [],
        };

        // Dedup per super: keep cheapest SHELF UNIT price.
        // Tie-break (ADR-6): barcode beats name_similarity on equal shelf unit prices.
        const bySuperMap = new Map<string, UnitMatch>();
        for (const m of [homeUnitMatch, ...externalUnitMatches]) {
          const existing = bySuperMap.get(m.super);
          const beatsExisting =
            !existing ||
            m.price < existing.price ||
            (m.price === existing.price &&
              m.matched_by === 'barcode' &&
              existing.matched_by === 'name_similarity');
          if (beatsExisting) bySuperMap.set(m.super, m);
        }

        // After dedup: compute effective line total per surviving super (ADR-1).
        // nth_unit math is non-linear in qty — must compute at real qty, not per-unit × qty.
        const dedupedMatches: SuperMatch[] = [...bySuperMap.values()].map((m) => {
          const shelfUnit = m.price;
          const best = pickBestNthUnitPromo(m._promotions, shelfUnit, qty);
          const effective = effectiveLineTotal(shelfUnit, best, qty);
          return {
            super: m.super,
            product_id: m.product_id,
            name: m.name,
            matched_by: m.matched_by,
            price: round2(effective), // EFFECTIVE line total
            unit_price: round2(shelfUnit * qty), // shelf total (strike-through baseline)
            promo_label: best?.label ?? null,
            info_badges: collectInfoBadges(m._promotions),
          };
        });

        // Home effective fields
        const homeBest = pickBestNthUnitPromo(homePromos, unitHomePrice, qty);
        const homeEffective = effectiveLineTotal(unitHomePrice, homeBest, qty);

        result.push({
          shopping_id: s.item_id,
          name: base.name,
          home_super: base.home_super,
          home_price: round2(homeEffective),
          home_unit_price: round2(unitHomePrice * qty),
          home_promo_label: homeBest?.label ?? null,
          home_info_badges: collectInfoBadges(homePromos),
          matches: dedupedMatches,
        });
      }

      return result;
    },

    async buildCompareItems(): Promise<CompareItem[]> {
      // Fetch shopping rows → map to SourceRow (quantity=1) → delegate
      const shoppingRows = await prisma.$queryRaw<ShoppingRow[]>(Prisma.sql`
        SELECT s.id AS shopping_id, s.product_id
        FROM shopping s
        JOIN products p ON s.product_id = p.id
        WHERE COALESCE(p.offer_price, p.raw_price) IS NOT NULL
      `);

      const source: SourceRow[] = shoppingRows.map((r) => ({
        item_id: Number(r.shopping_id),
        product_id: Number(r.product_id),
        quantity: 1,
      }));

      return this.buildCompareItemsFromSource(source);
    },
  };
}
