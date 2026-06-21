import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { ListTemplateItem, MatchRules, ProductCandidate } from '../domain/generator.js';
import { selectBestProduct } from '../domain/generator.js';

type JsonArray = Prisma.JsonValue[];

export interface FindBestParams {
  categoryKey: string;
  tier: number;
  priceDriven: boolean;
  nameHint: string;
  sizeHint: string | null;
  rules: MatchRules;
}

export interface ListGeneratorRepo {
  getTemplateItems(perfilHogar: string): Promise<ListTemplateItem[]>;
  findBestProductId(params: FindBestParams): Promise<number | null>;
  bulkAddToShopping(items: Array<{ product_id: number; frequency_days: number; notes: string }>): Promise<number>;
  clearGeneratedItems(): Promise<number>;
}

type PrismaLike = Pick<PrismaClient, '$queryRaw' | '$transaction' | 'list_templates' | 'shopping' | 'products'>;

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

// INVARIANT: this char mapping must stay identical to the SQL filter
//   translate(lower(name), 'áéíóúüñàèìòù', 'aeiouunaeiou')
// used in findBestProductId. Do NOT replace it with the NFD-based
// stripDiacritics() helper — NFD strips marks the SQL translate() does not,
// so the JS keyword would stop matching the DB-side expression and the ILIKE
// would silently miss rows.
function normalizeKeyword(txt: string): string {
  return txt.toLowerCase()
    .replace(/[áà]/g, 'a').replace(/[éè]/g, 'e').replace(/[íì]/g, 'i')
    .replace(/[óò]/g, 'o').replace(/[úùü]/g, 'u').replace(/ñ/g, 'n');
}

export function makeListGeneratorRepo(prisma: PrismaLike): ListGeneratorRepo {
  return {
    async getTemplateItems(perfilHogar) {
      const rows = await prisma.list_templates.findMany({
        where: { perfil_hogar: perfilHogar },
      });
      return rows.map((r) => ({
        id: r.id,
        perfil_hogar: r.perfil_hogar,
        category_key: r.category_key,
        item_name: r.item_name,
        qty_base: r.qty_base,
        scale_per_person: r.scale_per_person,
        frequency_days: r.frequency_days,
        requires_module: r.requires_module,
        search_keyword: r.search_keyword ?? null,
        size_hint: r.size_hint ?? null,
        incluye: toStringArray(r.incluye as JsonArray | null),
        requiere_alguno: toStringArray(r.requiere_alguno as JsonArray | null),
        excluye: toStringArray(r.excluye as JsonArray | null),
        veta: toStringArray(r.veta as JsonArray | null),
      }));
    },

    async findBestProductId({ categoryKey, tier, priceDriven, nameHint, sizeHint, rules }) {
      // Primary SQL filter: first incluye term (specific) or nameHint (search_keyword)
      const primaryTerm = rules.incluye.length > 0 ? (rules.incluye[0] ?? nameHint) : nameHint;
      const keyword = `%${normalizeKeyword(primaryTerm)}%`;
      const sizeFilter = sizeHint ? Prisma.sql`AND name ILIKE ${`%${sizeHint}%`}` : Prisma.sql``;

      // Fetch up to 100 candidates pre-filtered by primary keyword
      const candidates = await (prisma as PrismaClient).$queryRaw<ProductCandidate[]>(Prisma.sql`
        SELECT id, name, brand_tier::int AS brand_tier,
               COALESCE(offer_price, raw_price)::float AS price
        FROM products
        WHERE category_key = ${categoryKey}
          AND available = true
          AND COALESCE(offer_price, raw_price) IS NOT NULL
          AND translate(lower(name), 'áéíóúüñàèìòù', 'aeiouunaeiou') ILIKE ${keyword}
          ${sizeFilter}
        LIMIT 100
      `);

      if (candidates.length > 0) {
        // Apply full diccionario-style filtering + outlier + tier scoring
        const best = selectBestProduct(candidates, rules, tier, priceDriven);
        if (best !== null) return best;

        // Rules filtered out everything — fall back to keyword candidates scored by tier only
        const fallbackRules: MatchRules = { incluye: [], requiere_alguno: [], excluye: [], veta: [] };
        const fallback = selectBestProduct(candidates, fallbackRules, tier, priceDriven);
        if (fallback !== null) return fallback;
      }

      // Last resort: any available product in the category with the requested tier
      const orderClause = priceDriven
        ? Prisma.sql`COALESCE(offer_price, raw_price) ASC NULLS LAST`
        : Prisma.sql`COALESCE(offer_price, raw_price) DESC NULLS LAST`;

      const lastResort = await (prisma as PrismaClient).$queryRaw<Array<{ id: number }>>(Prisma.sql`
        SELECT id FROM products
        WHERE category_key = ${categoryKey}
          AND available = true
          AND brand_tier = ${tier}
          AND COALESCE(offer_price, raw_price) IS NOT NULL
        ORDER BY ${orderClause}
        LIMIT 1
      `);
      return lastResort.length > 0 ? (lastResort[0]?.id ?? null) : null;
    },

    async clearGeneratedItems() {
      const result = await prisma.shopping.deleteMany({ where: { generated: true } });
      return result.count;
    },

    async bulkAddToShopping(items) {
      if (items.length === 0) return 0;

      const existingRows = await prisma.shopping.findMany({
        where: { product_id: { in: items.map((i) => i.product_id) } },
        select: { product_id: true },
      });
      const existingIds = new Set(existingRows.map((r) => r.product_id));
      const toInsert = items.filter((i) => !existingIds.has(i.product_id));

      if (toInsert.length === 0) return 0;

      await (prisma as PrismaClient).$transaction(
        toInsert.map((item) =>
          prisma.shopping.create({
            data: {
              product_id: item.product_id,
              frequency_days: item.frequency_days,
              notes: item.notes,
              generated: true,
            },
          }),
        ),
      );

      return toInsert.length;
    },
  };
}
