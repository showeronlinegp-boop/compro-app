-- CreateTable
CREATE TABLE "fiado_clientes" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "etiqueta" TEXT,
    "limite" INTEGER,
    "proximo_cobro" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fiado_clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiado_movimientos" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "monto" INTEGER NOT NULL,
    "corrige_id" INTEGER,
    "nota" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiado_movimientos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiado_recordatorios" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "enviado_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiado_recordatorios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiado_ajustes" (
    "user_id" INTEGER NOT NULL,
    "comercio" TEXT NOT NULL DEFAULT '',
    "alias" TEXT,
    "dias_deuda_vieja" INTEGER NOT NULL DEFAULT 30,
    "plantilla_fiado" TEXT,
    "plantilla_pago" TEXT,
    "plantilla_recordatorio" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fiado_ajustes_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "fiado_clientes_user_id_nombre_idx" ON "fiado_clientes"("user_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "fiado_movimientos_corrige_id_key" ON "fiado_movimientos"("corrige_id");

-- CreateIndex
CREATE INDEX "fiado_movimientos_user_id_cliente_id_created_at_idx" ON "fiado_movimientos"("user_id", "cliente_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "fiado_movimientos_user_id_idempotency_key_key" ON "fiado_movimientos"("user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "fiado_recordatorios_user_id_cliente_id_enviado_at_idx" ON "fiado_recordatorios"("user_id", "cliente_id", "enviado_at");

-- AddForeignKey
ALTER TABLE "fiado_clientes" ADD CONSTRAINT "fiado_clientes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiado_movimientos" ADD CONSTRAINT "fiado_movimientos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiado_movimientos" ADD CONSTRAINT "fiado_movimientos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "fiado_clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiado_movimientos" ADD CONSTRAINT "fiado_movimientos_corrige_id_fkey" FOREIGN KEY ("corrige_id") REFERENCES "fiado_movimientos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiado_recordatorios" ADD CONSTRAINT "fiado_recordatorios_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiado_recordatorios" ADD CONSTRAINT "fiado_recordatorios_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "fiado_clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiado_ajustes" ADD CONSTRAINT "fiado_ajustes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Reglas del libro de fiado que Prisma no expresa (escritas a mano).
-- ---------------------------------------------------------------------------

-- Tipo y signo coherentes: fiado suma, pago resta, la correccion apunta a su original.
ALTER TABLE "fiado_movimientos" ADD CONSTRAINT "fiado_movimientos_tipo_check"
  CHECK (
    ("tipo" = 'fiado' AND "monto" > 0 AND "corrige_id" IS NULL) OR
    ("tipo" = 'pago' AND "monto" < 0 AND "corrige_id" IS NULL) OR
    ("tipo" = 'correccion' AND "monto" <> 0 AND "corrige_id" IS NOT NULL)
  );

-- Hasta 9 digitos, como el teclado.
ALTER TABLE "fiado_movimientos" ADD CONSTRAINT "fiado_movimientos_monto_check"
  CHECK ("monto" BETWEEN -999999999 AND 999999999);

ALTER TABLE "fiado_clientes" ADD CONSTRAINT "fiado_clientes_limite_check"
  CHECK ("limite" IS NULL OR "limite" >= 0);

ALTER TABLE "fiado_ajustes" ADD CONSTRAINT "fiado_ajustes_dias_check"
  CHECK ("dias_deuda_vieja" BETWEEN 1 AND 365);

-- Libro APPEND-ONLY: nadie puede editar ni borrar un movimiento a mano.
-- "Deshacer" crea un movimiento de correccion visible en el historial.
-- Unica excepcion: el borrado EN CASCADA al eliminar el usuario o el cliente.
-- Las acciones de FK corren como triggers internos, asi que en una cascada
-- pg_trigger_depth() es >= 2; en un DELETE directo vale 1.
CREATE FUNCTION "fiado_movimientos_append_only"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'fiado_movimientos es append-only: no se puede modificar un movimiento'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'fiado_movimientos es append-only: no se puede borrar un movimiento'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "fiado_movimientos_append_only"
  BEFORE UPDATE OR DELETE ON "fiado_movimientos"
  FOR EACH ROW EXECUTE FUNCTION "fiado_movimientos_append_only"();
