import type { PrismaClient } from '@prisma/client';
import type { PromoOfferInput, PromoOfferRow } from '../domain/types.js';

export interface PromosRepo {
  /**
   * Replace all offers for a given super in a single transaction:
   * DELETE existing rows then INSERT the new ones.
   */
  replaceForSuper(superKey: string, offers: PromoOfferInput[], sourceUrl: string): Promise<void>;
  /** All rows ordered by super ASC, discount_pct DESC NULLS LAST, id ASC. */
  listAll(): Promise<PromoOfferRow[]>;
}

export function makePromosRepo(prisma: PrismaClient): PromosRepo {
  return {
    async replaceForSuper(superKey, offers, sourceUrl) {
      const now = BigInt(Date.now());

      // Array-form $transaction: DELETE + createMany executed atomically.
      // We use a batch of individual creates (not createMany) to preserve
      // exact insert order and match id sequencing.
      await prisma.$transaction([
        prisma.promo_offers.deleteMany({ where: { super: superKey } }),
        prisma.promo_offers.createMany({
          data: offers.map((o) => ({
            super: superKey,
            bank: o.bank,
            title: o.title,
            description: o.description,
            discount_pct: o.discountPct,
            installments: o.installments,
            // interest_free: boolean|null in input → stored as boolean in PG
            interest_free: o.interestFree,
            logo_url: o.logoUrl,
            image_url: o.imageUrl,
            validity: o.validity,
            source_url: sourceUrl,
            captured_at: now,
          })),
        }),
      ]);
    },

    async listAll() {
      const rows = await prisma.promo_offers.findMany({
        orderBy: [
          { super: 'asc' },
          // Prisma doesn't support NULLS LAST directly — use $queryRaw for correctness
        ],
      });

      // Re-query with raw SQL to get NULLS LAST ordering (critical spec requirement)
      const rawRows = await prisma.$queryRaw<
        Array<{
          id: number;
          super: string;
          bank: string | null;
          title: string | null;
          description: string | null;
          discount_pct: number | null;
          installments: number | null;
          interest_free: boolean | null;
          logo_url: string | null;
          image_url: string | null;
          validity: string | null;
          source_url: string;
          captured_at: bigint;
        }>
      >`
        SELECT id, super, bank, title, description, discount_pct, installments,
               interest_free, logo_url, image_url, validity, source_url, captured_at
        FROM promo_offers
        ORDER BY super ASC, discount_pct DESC NULLS LAST, id ASC
      `;

      // Map to PromoOfferRow: BigInt captured_at → number, boolean interest_free → number|null
      return rawRows.map((r) => ({
        id: r.id,
        super: r.super,
        bank: r.bank,
        title: r.title,
        description: r.description,
        discount_pct: r.discount_pct,
        installments: r.installments,
        // interest_free: API contract expects number (0/1/null) — legacy test compat
        interest_free: r.interest_free === null ? null : r.interest_free ? 1 : 0,
        logo_url: r.logo_url,
        image_url: r.image_url,
        validity: r.validity,
        source_url: r.source_url,
        // captured_at: BigInt → number (safe; values are Date.now() ms < 2^53)
        captured_at: Number(r.captured_at),
      })) as PromoOfferRow[];
    },
  };
}
