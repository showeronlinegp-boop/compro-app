-- Recargos por atraso (propuesta "Recargos por atraso"). Todo es aditivo: no
-- se modifica ningún dato existente y, con la opción apagada (recargo NULL en
-- fiado_ajustes), la app se comporta exactamente igual que antes.

-- ── Movimientos: nuevo tipo 'recargo', siempre pegado a un fiado ────────────
-- recargo_de      = el fiado al que pertenece el recargo.
-- recargo_periodo = último período de atraso que cubre (mes, semana o tramo).
ALTER TABLE "fiado_movimientos"
  ADD COLUMN "recargo_de" INTEGER,
  ADD COLUMN "recargo_periodo" SMALLINT;

ALTER TABLE "fiado_movimientos" ADD CONSTRAINT "fiado_movimientos_recargo_de_fkey"
  FOREIGN KEY ("recargo_de") REFERENCES "fiado_movimientos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "fiado_movimientos_recargo_de_idx" ON "fiado_movimientos"("recargo_de");

-- Se amplía la regla de tipo y signo: los movimientos existentes la cumplen.
ALTER TABLE "fiado_movimientos" DROP CONSTRAINT "fiado_movimientos_tipo_check";
ALTER TABLE "fiado_movimientos" ADD CONSTRAINT "fiado_movimientos_tipo_check"
  CHECK (
    ("tipo" = 'fiado' AND "monto" > 0 AND "corrige_id" IS NULL AND "recargo_de" IS NULL AND "recargo_periodo" IS NULL) OR
    ("tipo" = 'pago' AND "monto" < 0 AND "corrige_id" IS NULL AND "recargo_de" IS NULL AND "recargo_periodo" IS NULL) OR
    ("tipo" = 'correccion' AND "monto" <> 0 AND "corrige_id" IS NOT NULL AND "recargo_de" IS NULL AND "recargo_periodo" IS NULL) OR
    ("tipo" = 'recargo' AND "monto" > 0 AND "corrige_id" IS NULL AND "recargo_de" IS NOT NULL AND "recargo_periodo" >= 1)
  );

-- ── Ajustes: configuración del recargo ───────────────────────────────────────
-- recargo NULL = apagado. recargo_version sube cada vez que las condiciones
-- empeoran para el cliente (activar, subir, cambiar de esquema, achicar la
-- gracia): los clientes con una versión avisada menor quedan pendientes de aviso.
ALTER TABLE "fiado_ajustes"
  ADD COLUMN "recargo" JSONB,
  ADD COLUMN "recargo_version" INTEGER NOT NULL DEFAULT 0;

-- ── Clientes ─────────────────────────────────────────────────────────────────
ALTER TABLE "fiado_clientes"
  ADD COLUMN "sin_recargo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "recargo_aviso_version" INTEGER NOT NULL DEFAULT 0;

-- ── Avisos de condiciones: registro APPEND-ONLY ──────────────────────────────
-- Respaldo de que al cliente se le informaron las condiciones (por WhatsApp o
-- con "Cambio informado"), con el texto exacto de ese momento.
CREATE TABLE "fiado_avisos_recargo" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL,
  "cliente_id" INTEGER NOT NULL,
  "version" INTEGER NOT NULL,
  "condiciones" TEXT NOT NULL,
  "via" VARCHAR(20) NOT NULL CHECK ("via" IN ('whatsapp', 'informado')),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

ALTER TABLE "fiado_avisos_recargo" ADD CONSTRAINT "fiado_avisos_recargo_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fiado_avisos_recargo" ADD CONSTRAINT "fiado_avisos_recargo_cliente_id_fkey"
  FOREIGN KEY ("cliente_id") REFERENCES "fiado_clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "fiado_avisos_recargo_user_id_cliente_id_idx" ON "fiado_avisos_recargo"("user_id", "cliente_id");

-- Igual que el libro: nadie edita ni borra un aviso, salvo la cascada al
-- eliminar el usuario o el cliente (pg_trigger_depth() >= 2).
CREATE FUNCTION "fiado_avisos_recargo_append_only"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'fiado_avisos_recargo es append-only: no se puede modificar un aviso'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'fiado_avisos_recargo es append-only: no se puede borrar un aviso'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "fiado_avisos_recargo_append_only"
  BEFORE UPDATE OR DELETE ON "fiado_avisos_recargo"
  FOR EACH ROW EXECUTE FUNCTION "fiado_avisos_recargo_append_only"();

-- ── Períodos que el comercio decidió no cobrar ("No cobrar") ────────────────
CREATE TABLE "fiado_recargo_omisiones" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL,
  "cliente_id" INTEGER NOT NULL,
  "fiado_id" INTEGER NOT NULL,
  "periodo" SMALLINT NOT NULL CHECK ("periodo" >= 1),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

ALTER TABLE "fiado_recargo_omisiones" ADD CONSTRAINT "fiado_recargo_omisiones_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fiado_recargo_omisiones" ADD CONSTRAINT "fiado_recargo_omisiones_cliente_id_fkey"
  FOREIGN KEY ("cliente_id") REFERENCES "fiado_clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fiado_recargo_omisiones" ADD CONSTRAINT "fiado_recargo_omisiones_fiado_id_fkey"
  FOREIGN KEY ("fiado_id") REFERENCES "fiado_movimientos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "fiado_recargo_omisiones_fiado_id_periodo_key" ON "fiado_recargo_omisiones"("fiado_id", "periodo");
CREATE INDEX "fiado_recargo_omisiones_user_id_cliente_id_idx" ON "fiado_recargo_omisiones"("user_id", "cliente_id");
