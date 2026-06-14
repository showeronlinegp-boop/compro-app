-- Add search hints to list_templates for smarter product matching
ALTER TABLE "list_templates" ADD COLUMN IF NOT EXISTS "search_keyword" TEXT;
ALTER TABLE "list_templates" ADD COLUMN IF NOT EXISTS "size_hint" TEXT;

-- Lacteos
UPDATE list_templates SET search_keyword = 'leche',  size_hint = '1 l'  WHERE item_name ILIKE '%leche%';
UPDATE list_templates SET search_keyword = 'yogur',  size_hint = NULL    WHERE item_name ILIKE '%yogur%';

-- Almacen
UPDATE list_templates SET search_keyword = 'yerba',      size_hint = '500'   WHERE item_name ILIKE '%yerba%';
UPDATE list_templates SET search_keyword = 'arroz',      size_hint = '500'   WHERE item_name ILIKE '%arroz%';
UPDATE list_templates SET search_keyword = 'fideo',      size_hint = '500'   WHERE item_name ILIKE '%fideo%';
UPDATE list_templates SET search_keyword = 'aceite',     size_hint = '900'   WHERE item_name ILIKE '%aceite%';
UPDATE list_templates SET search_keyword = 'azucar',     size_hint = '1 kg'  WHERE item_name ILIKE '%azucar%';
UPDATE list_templates SET search_keyword = 'harina',     size_hint = '1 kg'  WHERE item_name ILIKE '%harina%';
UPDATE list_templates SET search_keyword = 'galletita',  size_hint = NULL    WHERE item_name ILIKE '%galletita%';
UPDATE list_templates SET search_keyword = 'cacao',      size_hint = NULL    WHERE item_name ILIKE '%cacao%';

-- Bebidas
UPDATE list_templates SET search_keyword = 'gaseosa',   size_hint = '1,5'  WHERE item_name ILIKE '%gaseosa%';
UPDATE list_templates SET search_keyword = 'agua',      size_hint = '1,5'  WHERE item_name ILIKE '%agua%';

-- Limpieza
-- "Detergente ropa" → en el DB las opciones son "jabón en polvo", "Skip", "Ariel" — no "detergente"
UPDATE list_templates SET search_keyword = 'jabon',     size_hint = NULL   WHERE item_name ILIKE '%detergente ropa%';
UPDATE list_templates SET search_keyword = 'jabon',     size_hint = NULL   WHERE item_name ILIKE '%jabon en polvo%';
UPDATE list_templates SET search_keyword = 'lavandina', size_hint = '1 l'  WHERE item_name ILIKE '%lavandina%';
UPDATE list_templates SET search_keyword = 'papel',     size_hint = '4'    WHERE item_name ILIKE '%papel%';
UPDATE list_templates SET search_keyword = 'vajilla',   size_hint = '500'  WHERE item_name ILIKE '%vajilla%';

-- Personal
UPDATE list_templates SET search_keyword = 'shampoo',   size_hint = NULL   WHERE item_name ILIKE '%shampoo%';
UPDATE list_templates SET search_keyword = 'jabon',     size_hint = NULL   WHERE item_name ILIKE '%jabon de tocador%';
UPDATE list_templates SET search_keyword = 'pasta',     size_hint = '90'   WHERE item_name ILIKE '%pasta dental%';

-- Bebes / Mascotas
UPDATE list_templates SET search_keyword = 'panal',      size_hint = NULL  WHERE item_name ILIKE '%panal%';
UPDATE list_templates SET search_keyword = 'balanceado', size_hint = NULL  WHERE item_name ILIKE '%balanceado%';

-- ─── Brand rules faltantes ────────────────────────────────────────────────────

-- Yerba mate (marcas tier 1 y 2, para almacen Y desayuno)
INSERT INTO "brand_rules" ("category_key", "pattern", "tier", "priority") VALUES
('almacen',  '%taragui%',    1, 10),
('almacen',  '%rosamonte%',  1, 10),
('almacen',  '%union%',      2, 10),
('almacen',  '%cruz de malta%', 2, 10),
('desayuno', '%taragui%',    1, 10),
('desayuno', '%rosamonte%',  1, 10),
('desayuno', '%union%',      2, 10),
('desayuno', '%cruz de malta%', 2, 10),
-- Lavandina
('limpieza', '%ayudin%',     1, 10),
-- Papel higiénico
('limpieza', '%elite%',      1, 10),
('limpieza', '%higienol%',   2, 10),
('limpieza', '%renova%',     1, 10),
-- Galletitas / desayuno
('desayuno', '%oreo%',       1, 10),
('desayuno', '%bagley%',     1,  9),
('desayuno', '%terrabusi%',  1,  9),
('desayuno', '%triton%',     2, 10);
