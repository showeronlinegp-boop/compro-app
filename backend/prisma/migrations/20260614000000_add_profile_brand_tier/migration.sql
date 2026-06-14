-- Idempotent migration: safe to re-run if partially applied
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "category_key" TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "brand_tier" SMALLINT;

CREATE INDEX IF NOT EXISTS "products_category_key_idx" ON "products"("category_key");
CREATE INDEX IF NOT EXISTS "products_brand_tier_idx" ON "products"("brand_tier");

-- Brand tier classification rules table
CREATE TABLE IF NOT EXISTS "brand_rules" (
    "id" SERIAL NOT NULL,
    "category_key" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "tier" SMALLINT NOT NULL,
    "priority" SMALLINT NOT NULL DEFAULT 0,
    CONSTRAINT "brand_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "brand_rules_category_key_idx" ON "brand_rules"("category_key");

-- Default shopping list templates by household profile
CREATE TABLE IF NOT EXISTS "list_templates" (
    "id" SERIAL NOT NULL,
    "perfil_hogar" TEXT NOT NULL,
    "category_key" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "qty_base" SMALLINT NOT NULL DEFAULT 1,
    "scale_per_person" REAL NOT NULL DEFAULT 0,
    "frequency_days" SMALLINT NOT NULL DEFAULT 7,
    "requires_module" TEXT,
    CONSTRAINT "list_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "list_templates_perfil_idx" ON "list_templates"("perfil_hogar");

-- User onboarding profile (single-user app — one row)
CREATE TABLE IF NOT EXISTS "user_profiles" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "edad" SMALLINT,
    "genero" TEXT,
    "hogar_tamano" SMALLINT NOT NULL DEFAULT 1,
    "hogar_chicos" JSONB,
    "hogar_adultos_mayores" BOOLEAN NOT NULL DEFAULT false,
    "hogar_mascotas" JSONB,
    "tier_por_categoria" JSONB NOT NULL,
    "price_driven" JSONB,
    "perfil_hogar" TEXT NOT NULL,
    "nse_proxy" TEXT,
    "onboarding_done" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- Seed: truncate first so re-runs always produce a clean state
TRUNCATE TABLE "brand_rules";
TRUNCATE TABLE "list_templates";

-- Seed brand_rules for Argentine supermarket brands
INSERT INTO "brand_rules" ("category_key", "pattern", "tier", "priority") VALUES
-- Lacteos tier 1
('lacteos', '%serenisima%', 1, 10),
('lacteos', '%sancor%', 1, 10),
('lacteos', '%danone%', 1, 10),
('lacteos', '%activia%', 1, 9),
('lacteos', '%actimel%', 1, 9),
-- Lacteos tier 2
('lacteos', '%ilolay%', 2, 10),
('lacteos', '%tregar%', 2, 10),
-- Almacen tier 1
('almacen', '%matarazzo%', 1, 10),
('almacen', '%natura%', 1, 10),
('almacen', '%arcor%', 1, 9),
('almacen', '%maizena%', 1, 9),
('almacen', '%knorr%', 1, 9),
('almacen', '%ledesma%', 1, 9),
('almacen', '%molinos%', 1, 8),
-- Almacen tier 2
('almacen', '%favorita%', 2, 10),
('almacen', '%lucchetti%', 2, 9),
('almacen', '%luchetti%', 2, 9),
-- Almacen tier 3
('almacen', '%marolio%', 3, 10),
('almacen', '%regio%', 3, 10),
-- Bebidas tier 1
('bebidas', '%coca-cola%', 1, 10),
('bebidas', '%coca cola%', 1, 10),
('bebidas', '%pepsi%', 1, 10),
('bebidas', '%sprite%', 1, 10),
('bebidas', '%fanta%', 1, 10),
('bebidas', '%7up%', 1, 10),
('bebidas', '%seven up%', 1, 9),
('bebidas', '%aquarius%', 1, 9),
('bebidas', '%villavicencio%', 1, 9),
-- Bebidas tier 2
('bebidas', '%pritty%', 2, 10),
('bebidas', '%secco%', 2, 10),
('bebidas', '%baggio%', 2, 9),
-- Bebidas tier 3
('bebidas', '%manaos%', 3, 10),
-- Limpieza tier 1
('limpieza', '%skip%', 1, 10),
('limpieza', '%ala %', 1, 10),
('limpieza', '%ariel%', 1, 10),
('limpieza', '%downy%', 1, 10),
('limpieza', '%comfort%', 1, 10),
('limpieza', '%ajax%', 1, 9),
('limpieza', '%don limpio%', 1, 9),
('limpieza', '%cif%', 1, 9),
('limpieza', '%lysoform%', 1, 9),
-- Limpieza tier 2
('limpieza', '%zorro%', 2, 10),
('limpieza', '%querubin%', 2, 10),
-- Personal tier 1
('personal', '%sedal%', 1, 10),
('personal', '%dove%', 1, 10),
('personal', '%pantene%', 1, 10),
('personal', '%head shoulders%', 1, 10),
('personal', '%clear%', 1, 9),
('personal', '%nivea%', 1, 10),
('personal', '%rexona%', 1, 10),
('personal', '%gillette%', 1, 10),
('personal', '%johnsons%', 1, 9),
('personal', '%listerine%', 1, 9),
('personal', '%oral-b%', 1, 9),
('personal', '%colgate%', 1, 9),
-- Personal tier 2
('personal', '%plusbelle%', 2, 10),
('personal', '%tio nacho%', 2, 10),
-- Marca propia supermercados (tier 3) para todas las categorias
('lacteos', '%dia %', 3, 5),
('almacen', '%dia %', 3, 5),
('bebidas', '%dia %', 3, 5),
('limpieza', '%dia %', 3, 5),
('personal', '%dia %', 3, 5),
('lacteos', '%carrefour%', 3, 5),
('almacen', '%carrefour%', 3, 5),
('bebidas', '%carrefour%', 3, 5),
('limpieza', '%carrefour%', 3, 5),
('personal', '%carrefour%', 3, 5);

-- Seed list_templates — familia_con_ninos
INSERT INTO "list_templates" ("perfil_hogar", "category_key", "item_name", "qty_base", "scale_per_person", "frequency_days", "requires_module") VALUES
('familia_con_ninos', 'lacteos', 'Leche entera', 4, 1.0, 7, NULL),
('familia_con_ninos', 'lacteos', 'Yogur', 2, 0.5, 14, NULL),
('familia_con_ninos', 'almacen', 'Yerba mate', 1, 0.25, 30, NULL),
('familia_con_ninos', 'almacen', 'Arroz', 1, 0.5, 30, NULL),
('familia_con_ninos', 'almacen', 'Fideos', 2, 0.5, 14, NULL),
('familia_con_ninos', 'almacen', 'Aceite de girasol', 1, 0.25, 30, NULL),
('familia_con_ninos', 'almacen', 'Azucar', 1, 0.25, 30, NULL),
('familia_con_ninos', 'almacen', 'Harina', 1, 0.25, 30, NULL),
('familia_con_ninos', 'bebidas', 'Gaseosa', 3, 0.5, 14, NULL),
('familia_con_ninos', 'bebidas', 'Agua mineral', 2, 0.5, 14, NULL),
('familia_con_ninos', 'limpieza', 'Detergente ropa', 1, 0.25, 30, NULL),
('familia_con_ninos', 'limpieza', 'Jabon en polvo', 1, 0.25, 30, NULL),
('familia_con_ninos', 'limpieza', 'Lavandina', 1, 0.0, 30, NULL),
('familia_con_ninos', 'limpieza', 'Papel higienico', 4, 1.0, 14, NULL),
('familia_con_ninos', 'limpieza', 'Detergente vajilla', 1, 0.0, 30, NULL),
('familia_con_ninos', 'personal', 'Shampoo', 1, 0.0, 30, NULL),
('familia_con_ninos', 'personal', 'Jabon de tocador', 2, 0.5, 30, NULL),
('familia_con_ninos', 'personal', 'Pasta dental', 1, 0.25, 30, NULL),
('familia_con_ninos', 'desayuno', 'Galletitas', 2, 0.5, 14, 'chicos'),
('familia_con_ninos', 'desayuno', 'Cacao en polvo', 1, 0.0, 30, 'chicos'),
('familia_con_ninos', 'bebes', 'Panales', 2, 0.0, 14, 'bebes'),
('familia_con_ninos', 'mascotas', 'Balanceado perro', 1, 0.0, 30, 'mascotas_perro'),
('familia_con_ninos', 'mascotas', 'Balanceado gato', 1, 0.0, 30, 'mascotas_gato');

-- Seed list_templates — joven_solo
INSERT INTO "list_templates" ("perfil_hogar", "category_key", "item_name", "qty_base", "scale_per_person", "frequency_days", "requires_module") VALUES
('joven_solo', 'lacteos', 'Leche entera', 1, 0.0, 7, NULL),
('joven_solo', 'almacen', 'Yerba mate', 1, 0.0, 30, NULL),
('joven_solo', 'almacen', 'Arroz', 1, 0.0, 30, NULL),
('joven_solo', 'almacen', 'Fideos', 1, 0.0, 14, NULL),
('joven_solo', 'almacen', 'Aceite de girasol', 1, 0.0, 30, NULL),
('joven_solo', 'bebidas', 'Gaseosa', 1, 0.0, 14, NULL),
('joven_solo', 'bebidas', 'Agua mineral', 1, 0.0, 14, NULL),
('joven_solo', 'limpieza', 'Detergente ropa', 1, 0.0, 30, NULL),
('joven_solo', 'limpieza', 'Papel higienico', 1, 0.0, 14, NULL),
('joven_solo', 'limpieza', 'Detergente vajilla', 1, 0.0, 30, NULL),
('joven_solo', 'personal', 'Shampoo', 1, 0.0, 30, NULL),
('joven_solo', 'personal', 'Pasta dental', 1, 0.0, 30, NULL),
('joven_solo', 'mascotas', 'Balanceado perro', 1, 0.0, 30, 'mascotas_perro'),
('joven_solo', 'mascotas', 'Balanceado gato', 1, 0.0, 30, 'mascotas_gato');

-- Seed list_templates — pareja
INSERT INTO "list_templates" ("perfil_hogar", "category_key", "item_name", "qty_base", "scale_per_person", "frequency_days", "requires_module") VALUES
('pareja', 'lacteos', 'Leche entera', 2, 0.0, 7, NULL),
('pareja', 'lacteos', 'Yogur', 1, 0.0, 14, NULL),
('pareja', 'almacen', 'Yerba mate', 1, 0.0, 30, NULL),
('pareja', 'almacen', 'Arroz', 1, 0.0, 30, NULL),
('pareja', 'almacen', 'Fideos', 1, 0.0, 14, NULL),
('pareja', 'almacen', 'Aceite de girasol', 1, 0.0, 30, NULL),
('pareja', 'almacen', 'Azucar', 1, 0.0, 30, NULL),
('pareja', 'bebidas', 'Gaseosa', 2, 0.0, 14, NULL),
('pareja', 'bebidas', 'Agua mineral', 1, 0.0, 14, NULL),
('pareja', 'limpieza', 'Detergente ropa', 1, 0.0, 30, NULL),
('pareja', 'limpieza', 'Papel higienico', 2, 0.0, 14, NULL),
('pareja', 'limpieza', 'Lavandina', 1, 0.0, 30, NULL),
('pareja', 'limpieza', 'Detergente vajilla', 1, 0.0, 30, NULL),
('pareja', 'personal', 'Shampoo', 1, 0.0, 30, NULL),
('pareja', 'personal', 'Pasta dental', 1, 0.0, 30, NULL),
('pareja', 'mascotas', 'Balanceado perro', 1, 0.0, 30, 'mascotas_perro'),
('pareja', 'mascotas', 'Balanceado gato', 1, 0.0, 30, 'mascotas_gato');

-- Seed list_templates — adultos_mayores
INSERT INTO "list_templates" ("perfil_hogar", "category_key", "item_name", "qty_base", "scale_per_person", "frequency_days", "requires_module") VALUES
('adultos_mayores', 'lacteos', 'Leche entera', 2, 0.0, 7, NULL),
('adultos_mayores', 'lacteos', 'Yogur', 2, 0.0, 14, NULL),
('adultos_mayores', 'almacen', 'Yerba mate', 1, 0.0, 30, NULL),
('adultos_mayores', 'almacen', 'Arroz', 1, 0.0, 30, NULL),
('adultos_mayores', 'almacen', 'Fideos', 1, 0.0, 14, NULL),
('adultos_mayores', 'almacen', 'Aceite de girasol', 1, 0.0, 30, NULL),
('adultos_mayores', 'bebidas', 'Agua mineral', 2, 0.0, 14, NULL),
('adultos_mayores', 'limpieza', 'Detergente ropa', 1, 0.0, 30, NULL),
('adultos_mayores', 'limpieza', 'Papel higienico', 2, 0.0, 14, NULL),
('adultos_mayores', 'limpieza', 'Lavandina', 1, 0.0, 30, NULL),
('adultos_mayores', 'personal', 'Pasta dental', 1, 0.0, 30, NULL),
('adultos_mayores', 'farmacia', 'Vitaminas', 1, 0.0, 30, NULL);
