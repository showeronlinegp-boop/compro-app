-- Per-super selected physical store for region-accurate prices/stock.
-- stores: { "carrefour": {"sellerId":"carrefourar0899","storeId":"...","name":"Hiper Pergamino"}, ... }
-- region_ids (already present) holds base64("SW#"+sellerId) derived from each store.
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "stores" JSONB;
