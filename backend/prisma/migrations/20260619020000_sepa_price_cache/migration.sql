-- Cache of SEPA (Precios Claros) zone prices, keyed by product barcode + postal code.
-- Used to serve VEA prices by zone on-demand without hammering the SEPA API
-- (which rate-limits) — refreshed when older than the read-side TTL.
CREATE TABLE IF NOT EXISTS "sepa_price_cache" (
  "barcode"     TEXT NOT NULL,
  "postal_code" TEXT NOT NULL,
  "price"       DOUBLE PRECISION,
  "promo_price" DOUBLE PRECISION,
  "found"       BOOLEAN NOT NULL DEFAULT false,
  "fetched_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  PRIMARY KEY ("barcode", "postal_code")
);
