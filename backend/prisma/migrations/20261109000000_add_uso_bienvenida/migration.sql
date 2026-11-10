-- Medir la bienvenida (plan de adopción, punto 4): evento nuevo
-- 'bienvenida_hecha' cuando el comercio completa la bienvenida guiada. Que la
-- vio ya queda como 'pantalla' con ruta_id 'bienvenida'.
ALTER TABLE "uso_eventos" DROP CONSTRAINT "uso_eventos_evento_check";
ALTER TABLE "uso_eventos" ADD CONSTRAINT "uso_eventos_evento_check"
  CHECK ("evento" IN ('pantalla', 'comprobante', 'instalar', 'bienvenida_hecha'));
