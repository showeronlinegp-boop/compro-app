-- Fecha de cobro por fiado (nota de prueba #3). Sólo un fiado puede tener
-- vencimiento; los pagos se imputan al calcular (no se guarda a qué fiado van).
ALTER TABLE "fiado_movimientos" ADD COLUMN "vence" DATE;

ALTER TABLE "fiado_movimientos" ADD CONSTRAINT "fiado_movimientos_vence_check"
  CHECK ("vence" IS NULL OR "tipo" = 'fiado');
