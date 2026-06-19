-- Add generated flag to shopping rows so auto-generated items can be
-- identified and cleared without relying on a fragile notes regex.
ALTER TABLE "shopping" ADD COLUMN IF NOT EXISTS "generated" BOOLEAN NOT NULL DEFAULT false;
