-- Deuda vieja a los 15 días para los comercios nuevos (plan de adopción, punto 11).
-- Los que ya guardaron sus ajustes conservan su valor.
ALTER TABLE "fiado_ajustes" ALTER COLUMN "dias_deuda_vieja" SET DEFAULT 15;
