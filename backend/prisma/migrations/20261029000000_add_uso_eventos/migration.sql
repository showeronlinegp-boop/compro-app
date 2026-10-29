-- Uso de la app (panel de admin, fase 2): qué pantallas abre cada comercio y
-- acciones que no dejan otro rastro (comprobante por WhatsApp, instalar la app).
-- Sin datos de los clientes del comercio. Se borra a los 400 días (cron diario).
CREATE TABLE "uso_eventos" (
  "id" BIGSERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL,
  "evento" VARCHAR(20) NOT NULL CHECK ("evento" IN ('pantalla', 'comprobante', 'instalar')),
  "modulo" VARCHAR(40) NOT NULL,
  "ruta_id" VARCHAR(40),
  -- Abierta desde el ícono (app instalada) y desde una pantalla táctil.
  "standalone" BOOLEAN NOT NULL DEFAULT false,
  "movil" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

ALTER TABLE "uso_eventos" ADD CONSTRAINT "uso_eventos_user_id_fkey" FOREIGN KEY ("user_id")
  REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "uso_eventos_created_at_idx" ON "uso_eventos"("created_at");
CREATE INDEX "uso_eventos_user_id_created_at_idx" ON "uso_eventos"("user_id", "created_at");
