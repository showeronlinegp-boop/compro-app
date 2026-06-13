-- Enable unaccent extension for accent-insensitive search.
-- Must appear before the immutable_unaccent function and any table DDL that depends on it.
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- Enable pg_trgm for GIN trigram index (accelerates substring ILIKE searches).
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create an IMMUTABLE wrapper around unaccent().
-- unaccent() itself is STABLE, which blocks its use in an index expression.
-- This wrapper is declared IMMUTABLE so PostgreSQL accepts it in functional indexes
-- and allows the query planner to use the GIN index.
-- Body uses the standard single-argument form: SELECT unaccent($1).
-- CRITICAL: the query fragment in buildNameSearch() MUST use immutable_unaccent() identically.
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT unaccent($1)
$$;

-- CreateTable
CREATE TABLE "products" (
    "id" SERIAL NOT NULL,
    "super" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "sku_id" TEXT,
    "name" TEXT NOT NULL,
    "barcode" TEXT,
    "image_url" TEXT,
    "product_url" TEXT,
    "raw_price" DOUBLE PRECISION,
    "offer_price" DOUBLE PRECISION,
    "discount_pct" INTEGER NOT NULL DEFAULT 0,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "categories" JSONB,
    "promotions" JSONB,
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interests" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "frequency_days" INTEGER NOT NULL DEFAULT 7,
    "last_bought" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shopping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_log" (
    "id" SERIAL NOT NULL,
    "super" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "product_count" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "progress_leaf" INTEGER NOT NULL DEFAULT 0,
    "total_leaves" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sync_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_offers" (
    "id" SERIAL NOT NULL,
    "super" TEXT NOT NULL,
    "bank" TEXT,
    "title" TEXT,
    "description" TEXT,
    "discount_pct" INTEGER,
    "installments" INTEGER,
    "interest_free" BOOLEAN,
    "logo_url" TEXT,
    "image_url" TEXT,
    "validity" TEXT,
    "source_url" TEXT NOT NULL,
    "captured_at" BIGINT NOT NULL,

    CONSTRAINT "promo_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_super_idx" ON "products"("super");

-- CreateIndex
CREATE INDEX "products_discount_pct_idx" ON "products"("discount_pct");

-- CreateIndex
CREATE UNIQUE INDEX "products_super_product_id_key" ON "products"("super", "product_id");

-- CreateIndex
CREATE INDEX "interests_product_id_idx" ON "interests"("product_id");

-- CreateIndex
CREATE INDEX "shopping_product_id_idx" ON "shopping"("product_id");

-- CreateIndex
CREATE INDEX "promo_offers_super_captured_at_idx" ON "promo_offers"("super", "captured_at");

-- AddForeignKey
ALTER TABLE "interests" ADD CONSTRAINT "interests_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping" ADD CONSTRAINT "shopping_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- GIN trigram index on the normalized product name expression.
-- Accelerates ILIKE '%token%' searches (leading-wildcard) which btree indexes cannot help with.
-- Expression order: unaccent → lower → strip non-alphanum.
-- lower() MUST precede regexp_replace so [^a-z0-9] does not strip uppercase letters before lowercasing.
-- This is the ONLY trgm/GIN index on products — products_norm_name_trgm is NOT created.
-- The query fragment in buildNameSearch() MUST use the identical expression.
CREATE INDEX "products_name_norm_gin"
  ON "products"
  USING gin (regexp_replace(lower(immutable_unaccent(name)), '[^a-z0-9]+', ' ', 'g') gin_trgm_ops);
