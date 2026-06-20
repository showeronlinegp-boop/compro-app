-- User location for region-accurate pricing.
-- postal_code: the CP the user entered.
-- region_ids: resolved VTEX regionId per super, e.g.
--   {"carrefour":"U1cj...","dia":"U1cj...","masonline":"v2...","vea":null}
-- VEA stays null because Cencosud's region resolution is not publicly reachable.
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "postal_code" TEXT;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "region_ids" JSONB;
