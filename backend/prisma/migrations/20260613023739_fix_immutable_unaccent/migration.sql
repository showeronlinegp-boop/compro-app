-- Fix immutable_unaccent: replace unaccent('unaccent', $1) with unaccent($1).
-- The 'unaccent' dictionary-qualified form corrupts column values (drops first char)
-- when applied to actual column data. Using unaccent($1) (default dictionary) is
-- the standard pattern; declaring it IMMUTABLE is safe since unaccent is deterministic.
-- The GIN index on name must be rebuilt to use the corrected expression.

-- Drop the GIN index first (it depends on immutable_unaccent)
DROP INDEX IF EXISTS "products_name_norm_gin";

-- Replace the function with the correct implementation
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT unaccent($1)
$$;

-- Recreate the GIN index with the corrected expression.
-- Order: unaccent → lower → strip non-alphanum (regexp_replace must come AFTER lower
-- so that [^a-z0-9] does not strip uppercase letters before lowercasing).
CREATE INDEX "products_name_norm_gin"
  ON "products"
  USING gin (regexp_replace(lower(immutable_unaccent(name)), '[^a-z0-9]+', ' ', 'g') gin_trgm_ops);
