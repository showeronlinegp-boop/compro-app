/** Raw row as stored in the promo_offers table. */
export interface PromoOfferRow {
  id: number;
  super: string;
  bank: string | null;
  title: string | null;
  description: string | null;
  discount_pct: number | null;
  installments: number | null;
  interest_free: number | null;
  logo_url: string | null;
  image_url: string | null;
  validity: string | null;
  source_url: string;
  captured_at: number;
}

/** Input shape for inserting a new promo offer (before DB row ID is assigned). */
export interface PromoOfferInput {
  bank: string | null;
  title: string | null;
  description: string | null;
  discountPct: number | null;
  installments: number | null;
  interestFree: boolean | null;
  logoUrl: string | null;
  imageUrl: string | null;
  validity: string | null;
}
