import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { ListTemplateItem, MatchRules, ProductCandidate } from '../domain/generator.js';
import { selectBestProduct } from '../domain/generator.js';

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

type PrismaLike = Pick<PrismaClient, '$queryRaw' | 'list_templates' | 'shopping' | 'products'>;

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

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
        search_keyword: (r as { search_keyword?: string | null }).search_keyword ?? null,
        size_hint: (r as { size_hint?: string | null }).size_hint ?? null,
        incluye: toStringArray((r as any).incluye),
        requiere_alguno: toStringArray((r as any).requiere_alguno),
        excluye: toStringArray((r as any).excluye),
        veta: toStringArray((r as any).veta),
      }));
    },

    async findBestProductId({ categoryKey, tier, priceDriven, nameHint, sizeHint, rules }) {
      // Primary SQL filter: first incluye term (specific) or nameHint (search_keyword)
      const primaryTerm = rules.incluye.length > 0 ? rules.incluye[0] : nameHint;
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
      return lastResort.length > 0 ? lastResort[0].id : null;
    },

    async clearGeneratedItems() {
      // Elimina ítems auto-generados: tienen notes con patrón "Nombre x{qty}"
      const result = await (prisma as PrismaClient).$queryRaw<Array<{ count: string }>>(Prisma.sql`
        WITH deleted AS (
          DELETE FROM shopping
          WHERE notes ~ ' x[0-9]+$'
          RETURNING id
        )
        SELECT COUNT(*)::text AS count FROM deleted
      `);
      return parseInt(result[0]?.count ?? '0', 10);
    },

    async bulkAddToShopping(items) {
      let added = 0;
      for (const item of items) {
        const existing = await prisma.shopping.findFirst({ where: { product_id: item.product_id } });
        if (existing) continue;
        await prisma.shopping.create({
          data: {
            product_id: item.product_id,
            frequency_days: item.frequency_days,
            notes: item.notes,
          },
        });
        added++;
      }
      return added;
    },
  };
}
