import type Database from 'better-sqlite3';
import type { PromoOfferInput, PromoOfferRow } from '../domain/types.js';

export interface PromosRepo {
  /**
   * Replace all offers for a given super in a single transaction:
   * DELETE existing rows then INSERT the new ones.
   */
  replaceForSuper(superKey: string, offers: PromoOfferInput[], sourceUrl: string): void;
  /** All rows ordered by super ASC, discount_pct DESC NULLS LAST, id ASC. */
  listAll(): PromoOfferRow[];
}

export function makePromosRepo(db: Database.Database): PromosRepo {
  const deleteStmt = db.prepare<[string]>('DELETE FROM promo_offers WHERE super = ?');

  const insertStmt = db.prepare<
    [
      string, // super
      string | null, // bank
      string | null, // title
      string | null, // description
      number | null, // discount_pct
      number | null, // installments
      number | null, // interest_free (0/1)
      string | null, // logo_url
      string | null, // image_url
      string | null, // validity
      string, // source_url
      number, // captured_at
    ]
  >(`
    INSERT INTO promo_offers
      (super, bank, title, description, discount_pct, installments, interest_free,
       logo_url, image_url, validity, source_url, captured_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const replaceTx = db.transaction(
    (superKey: string, offers: PromoOfferInput[], sourceUrl: string) => {
      deleteStmt.run(superKey);
      const now = Date.now();
      for (const o of offers) {
        insertStmt.run(
          superKey,
          o.bank,
          o.title,
          o.description,
          o.discountPct,
          o.installments,
          o.interestFree === null ? null : o.interestFree ? 1 : 0,
          o.logoUrl,
          o.imageUrl,
          o.validity,
          sourceUrl,
          now,
        );
      }
    },
  );

  const listAllStmt = db.prepare<[], PromoOfferRow>(`
    SELECT id, super, bank, title, description, discount_pct, installments, interest_free,
           logo_url, image_url, validity, source_url, captured_at
    FROM promo_offers
    ORDER BY super ASC, discount_pct DESC NULLS LAST, id ASC
  `);

  return {
    replaceForSuper(superKey, offers, sourceUrl) {
      replaceTx(superKey, offers, sourceUrl);
    },

    listAll() {
      return listAllStmt.all();
    },
  };
}
