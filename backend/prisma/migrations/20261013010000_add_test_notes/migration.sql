-- Notas de prueba (cambio test-notes). Herramienta solo de desarrollo local:
-- la tabla existe en todos los entornos pero sin TEST_NOTES_ENABLED=1 no hay
-- rutas que la usen. Notas compartidas entre cuentas; user_id = autor.

-- CreateTable
CREATE TABLE "test_notes" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "tipo" VARCHAR(20) NOT NULL DEFAULT 'error',
    "estado" VARCHAR(20) NOT NULL DEFAULT 'abierta',
    "texto" TEXT NOT NULL,
    "ruta" VARCHAR(500) NOT NULL,
    "pantalla" VARCHAR(200),
    "selector" TEXT,
    "elemento" TEXT,
    "pos_x" DOUBLE PRECISION,
    "pos_y" INTEGER,
    "viewport_w" INTEGER,
    "contexto" JSONB,
    "modo" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "respuesta" TEXT,
    "resuelta_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "test_notes_pkey" PRIMARY KEY ("id"),
    -- Valores válidos: fuente de verdad en modules/test-notes/domain/test-note.ts.
    -- Prisma no modela ni diffea estos CHECK.
    CONSTRAINT "test_notes_tipo_check" CHECK ("tipo" IN ('error', 'mejora', 'duda')),
    CONSTRAINT "test_notes_estado_check" CHECK ("estado" IN ('abierta', 'en_curso', 'consulta', 'para_revisar', 'corregida', 'descartada'))
);

-- CreateIndex
CREATE INDEX "test_notes_estado_created_at_idx" ON "test_notes"("estado", "created_at");

-- CreateIndex
CREATE INDEX "test_notes_ruta_idx" ON "test_notes"("ruta");

-- AddForeignKey
ALTER TABLE "test_notes" ADD CONSTRAINT "test_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
