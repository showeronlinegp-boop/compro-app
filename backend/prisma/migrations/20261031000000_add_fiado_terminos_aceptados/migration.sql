-- Aceptación de términos (hoy: los del recargo por atraso). Registro APPEND-ONLY:
-- respaldo de que el comercio aceptó una versión determinada y cuándo.
CREATE TABLE "fiado_terminos_aceptados" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL,
  "documento" VARCHAR(30) NOT NULL CHECK ("documento" IN ('recargo')),
  "version" VARCHAR(20) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

ALTER TABLE "fiado_terminos_aceptados" ADD CONSTRAINT "fiado_terminos_aceptados_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "fiado_terminos_aceptados_user_id_documento_idx"
  ON "fiado_terminos_aceptados"("user_id", "documento");

-- Nadie edita ni borra una aceptación, salvo la cascada al eliminar el usuario.
CREATE FUNCTION "fiado_terminos_aceptados_append_only"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'fiado_terminos_aceptados es append-only: no se puede modificar'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'fiado_terminos_aceptados es append-only: no se puede borrar'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "fiado_terminos_aceptados_append_only"
  BEFORE UPDATE OR DELETE ON "fiado_terminos_aceptados"
  FOR EACH ROW EXECUTE FUNCTION "fiado_terminos_aceptados_append_only"();
