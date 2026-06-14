-- ═══════════════════════════════════════════════════════════════════════════
-- Comprehensive list_templates for all 4 Argentine household profiles
-- Based on DB analysis of actual product inventory and standard presentations
-- ═══════════════════════════════════════════════════════════════════════════

TRUNCATE TABLE list_templates RESTART IDENTITY;

-- ─── JOVEN_SOLO ───────────────────────────────────────────────────────────
-- 1 person, simple meals, basic household. Smaller quantities.
INSERT INTO list_templates (perfil_hogar, category_key, item_name, qty_base, scale_per_person, frequency_days, requires_module, search_keyword, size_hint) VALUES

-- Lácteos
('joven_solo', 'lacteos', 'Leche entera',         2, 0.0, 7,  NULL, 'leche entera',   '1 l'),
('joven_solo', 'lacteos', 'Yogur',                 2, 0.0, 14, NULL, 'yogur',   NULL),

-- Almacén básico
('joven_solo', 'almacen', 'Yerba mate',            1, 0.0, 30, NULL, 'yerba',   '500'),
('joven_solo', 'almacen', 'Arroz',                 1, 0.0, 30, NULL, 'arroz',   '500'),
('joven_solo', 'almacen', 'Fideos',                1, 0.0, 14, NULL, 'fideo',   '500'),
('joven_solo', 'almacen', 'Aceite de girasol',     1, 0.0, 30, NULL, 'aceite',  '900'),
('joven_solo', 'almacen', 'Azucar',                1, 0.0, 60, NULL, 'azucar',  'ledesma'),

-- Bebidas
('joven_solo', 'bebidas', 'Agua mineral',          2, 0.0, 14, NULL, 'agua mineral',    '1,5'),

-- Desayuno
('joven_solo', 'desayuno', 'Galletitas',           1, 0.0, 14, NULL, 'galletita', NULL),

-- Limpieza (kit básico 1 persona)
('joven_solo', 'limpieza', 'Papel higiénico',      4, 0.0, 14, NULL, 'papel',     '4'),
('joven_solo', 'limpieza', 'Detergente vajilla',   1, 0.0, 30, NULL, 'vajilla',   '500'),
('joven_solo', 'limpieza', 'Lavandina',            1, 0.0, 30, NULL, 'lavandina', '1 l'),
('joven_solo', 'limpieza', 'Limpiador multiuso',   1, 0.0, 30, NULL, 'limpiador', NULL),

-- Personal
('joven_solo', 'personal', 'Shampoo',              1, 0.0, 30, NULL, 'shampoo',      NULL),
('joven_solo', 'personal', 'Pasta dental',         1, 0.0, 60, NULL, 'pasta',         '90'),
('joven_solo', 'personal', 'Desodorante',          1, 0.0, 30, NULL, 'desodorante',  NULL),
('joven_solo', 'personal', 'Jabón de tocador',     1, 0.0, 30, NULL, 'tocador',      NULL),

-- Mascotas (condicional por módulo)
('joven_solo', 'mascotas', 'Balanceado perro',     1, 0.0, 30, 'mascotas_perro', 'balanceado', NULL),
('joven_solo', 'mascotas', 'Balanceado gato',      1, 0.0, 30, 'mascotas_gato',  'balanceado', NULL),

-- ─── PAREJA ───────────────────────────────────────────────────────────────
-- 2 personas adultas. Cocinan juntas, más variedad, ocasiones sociales.
('pareja', 'lacteos', 'Leche entera',              4, 0.0, 7,  NULL, 'leche entera',   '1 l'),
('pareja', 'lacteos', 'Yogur',                     4, 0.0, 14, NULL, 'yogur',   NULL),

('pareja', 'almacen', 'Yerba mate',                1, 0.0, 30, NULL, 'yerba',   '500'),
('pareja', 'almacen', 'Arroz',                     1, 0.0, 30, NULL, 'arroz',   '1 kg'),
('pareja', 'almacen', 'Fideos',                    2, 0.0, 14, NULL, 'fideo',   '500'),
('pareja', 'almacen', 'Aceite de girasol',         1, 0.0, 30, NULL, 'aceite',  '900'),
('pareja', 'almacen', 'Azucar',                    1, 0.0, 30, NULL, 'azucar',  'ledesma'),
('pareja', 'almacen', 'Harina',                    1, 0.0, 30, NULL, 'harina',  '1 kg'),

('pareja', 'bebidas', 'Gaseosa',                   1, 0.0, 14, NULL, 'gaseosa', '1,5'),
('pareja', 'bebidas', 'Agua mineral',              2, 0.0, 14, NULL, 'agua mineral',    '1,5'),

('pareja', 'desayuno', 'Galletitas',               2, 0.0, 14, NULL, 'galletita', NULL),

('pareja', 'limpieza', 'Papel higiénico',          4, 0.0, 14, NULL, 'papel',      '4'),
('pareja', 'limpieza', 'Jabón en polvo',           1, 0.0, 30, NULL, 'jabon',      NULL),
('pareja', 'limpieza', 'Suavizante ropa',          1, 0.0, 30, NULL, 'suavizante', NULL),
('pareja', 'limpieza', 'Detergente vajilla',       1, 0.0, 30, NULL, 'vajilla',    '500'),
('pareja', 'limpieza', 'Lavandina',                1, 0.0, 30, NULL, 'lavandina',  '1 l'),
('pareja', 'limpieza', 'Limpiador multiuso',       1, 0.0, 30, NULL, 'limpiador',  NULL),

('pareja', 'personal', 'Shampoo',                  1, 0.0, 30, NULL, 'shampoo',     NULL),
('pareja', 'personal', 'Pasta dental',             2, 0.0, 60, NULL, 'pasta',        '90'),
('pareja', 'personal', 'Desodorante',              2, 0.0, 30, NULL, 'desodorante', NULL),
('pareja', 'personal', 'Jabón de tocador',         2, 0.0, 30, NULL, 'tocador',     NULL),

('pareja', 'mascotas', 'Balanceado perro',         1, 0.0, 30, 'mascotas_perro', 'balanceado', NULL),
('pareja', 'mascotas', 'Balanceado gato',          1, 0.0, 30, 'mascotas_gato',  'balanceado', NULL),

-- ─── FAMILIA_CON_NINOS ────────────────────────────────────────────────────
-- 3+ personas con hijos. scale_per_person activo. Módulos chicos/bebes/mascotas.
('familia_con_ninos', 'lacteos', 'Leche entera',            4, 1.0, 7,  NULL,    'leche entera',      '1 l'),
('familia_con_ninos', 'lacteos', 'Yogur',                   4, 0.5, 14, NULL,    'yogur',              NULL),
('familia_con_ninos', 'lacteos', 'Leche chocolatada',       2, 0.5, 14, 'chicos','leche chocolatada',  NULL),

('familia_con_ninos', 'almacen', 'Yerba mate',              1, 0.25, 30, NULL,   'yerba',   '500'),
('familia_con_ninos', 'almacen', 'Arroz',                   1, 0.5,  30, NULL,   'arroz',   '1 kg'),
('familia_con_ninos', 'almacen', 'Fideos',                  2, 0.5,  14, NULL,   'fideo',   '500'),
('familia_con_ninos', 'almacen', 'Aceite de girasol',       1, 0.25, 30, NULL,   'aceite',  '900'),
('familia_con_ninos', 'almacen', 'Azucar',                  1, 0.25, 30, NULL,   'azucar',  'ledesma'),
('familia_con_ninos', 'almacen', 'Harina',                  1, 0.0,  30, NULL,   'harina',  '1 kg'),

('familia_con_ninos', 'bebidas', 'Gaseosa',                 2, 0.5,  14, NULL,    'gaseosa', '1,5'),
('familia_con_ninos', 'bebidas', 'Agua mineral',            2, 0.5,  14, NULL,    'agua mineral',    '1,5'),
('familia_con_ninos', 'bebidas', 'Jugo en polvo',           2, 0.5,  14, 'chicos','jugo',    NULL),

('familia_con_ninos', 'desayuno', 'Galletitas',             2, 0.5,  14, NULL,    'galletita', NULL),
('familia_con_ninos', 'desayuno', 'Cacao en polvo',         1, 0.0,  30, 'chicos','cacao',     NULL),

('familia_con_ninos', 'limpieza', 'Papel higiénico',        4, 1.0,  14, NULL,   'papel',      '4'),
('familia_con_ninos', 'limpieza', 'Jabón en polvo',         1, 0.25, 30, NULL,   'jabon',      NULL),
('familia_con_ninos', 'limpieza', 'Suavizante ropa',        1, 0.0,  30, NULL,   'suavizante', NULL),
('familia_con_ninos', 'limpieza', 'Detergente vajilla',     1, 0.0,  30, NULL,   'vajilla',    '500'),
('familia_con_ninos', 'limpieza', 'Lavandina',              1, 0.0,  30, NULL,   'lavandina',  '1 l'),
('familia_con_ninos', 'limpieza', 'Limpiador multiuso',     1, 0.0,  30, NULL,   'limpiador',  NULL),
('familia_con_ninos', 'limpieza', 'Bolsas de residuos',     1, 0.0,  30, NULL,   'residuo',    NULL),

('familia_con_ninos', 'personal', 'Shampoo',                1, 0.5,  30, NULL,   'shampoo',     NULL),
('familia_con_ninos', 'personal', 'Pasta dental',           2, 0.5,  60, NULL,   'pasta',        '90'),
('familia_con_ninos', 'personal', 'Desodorante',            2, 0.5,  30, NULL,   'desodorante', NULL),
('familia_con_ninos', 'personal', 'Jabón de tocador',       2, 0.5,  30, NULL,   'tocador',     NULL),

('familia_con_ninos', 'bebes',    'Pañales',                2, 0.0,  14, 'bebes',         'panal',      NULL),
('familia_con_ninos', 'mascotas', 'Balanceado perro',       1, 0.0,  30, 'mascotas_perro','balanceado', NULL),
('familia_con_ninos', 'mascotas', 'Balanceado gato',        1, 0.0,  30, 'mascotas_gato', 'balanceado', NULL),

-- ─── ADULTOS_MAYORES ──────────────────────────────────────────────────────
-- 2 adultos 60+. Foco en salud, más agua, menos gaseosa, vitaminas.
('adultos_mayores', 'lacteos', 'Leche entera',              4, 0.0, 7,  NULL,             'leche entera',      '1 l'),
('adultos_mayores', 'lacteos', 'Yogur',                     4, 0.0, 14, NULL,             'yogur',       NULL),

('adultos_mayores', 'almacen', 'Yerba mate',                1, 0.0, 30, NULL,             'yerba',      '500'),
('adultos_mayores', 'almacen', 'Arroz',                     1, 0.0, 30, NULL,             'arroz',      '500'),
('adultos_mayores', 'almacen', 'Fideos',                    1, 0.0, 14, NULL,             'fideo',      '500'),
('adultos_mayores', 'almacen', 'Aceite de girasol',         1, 0.0, 30, NULL,             'aceite',     '900'),
('adultos_mayores', 'almacen', 'Azucar',                    1, 0.0, 60, NULL,             'azucar',     'ledesma'),

('adultos_mayores', 'bebidas', 'Agua mineral',              4, 0.0, 14, NULL,             'agua mineral',       '1,5'),

('adultos_mayores', 'desayuno', 'Galletitas',               1, 0.0, 14, NULL,             'galletita',   NULL),

('adultos_mayores', 'limpieza', 'Papel higiénico',          4, 0.0, 14, NULL,             'papel',        '4'),
('adultos_mayores', 'limpieza', 'Jabón en polvo',           1, 0.0, 30, NULL,             'jabon',        NULL),
('adultos_mayores', 'limpieza', 'Detergente vajilla',       1, 0.0, 30, NULL,             'vajilla',    '500'),
('adultos_mayores', 'limpieza', 'Lavandina',                1, 0.0, 30, NULL,             'lavandina',  '1 l'),
('adultos_mayores', 'limpieza', 'Limpiador multiuso',       1, 0.0, 30, NULL,             'limpiador',   NULL),

('adultos_mayores', 'personal', 'Shampoo',                  1, 0.0, 30, NULL,             'shampoo',     NULL),
('adultos_mayores', 'personal', 'Pasta dental',             2, 0.0, 60, NULL,             'pasta',        '90'),
('adultos_mayores', 'personal', 'Desodorante',              2, 0.0, 30, NULL,             'desodorante', NULL),
('adultos_mayores', 'personal', 'Jabón de tocador',         2, 0.0, 30, NULL,             'tocador',      NULL),

('adultos_mayores', 'farmacia', 'Vitaminas',                1, 0.0, 30, 'adultos_mayores','vitamina',    NULL),

('adultos_mayores', 'mascotas', 'Balanceado perro',         1, 0.0, 30, 'mascotas_perro', 'balanceado',  NULL),
('adultos_mayores', 'mascotas', 'Balanceado gato',          1, 0.0, 30, 'mascotas_gato',  'balanceado',  NULL);

-- ─── Brand rules faltantes para categorías sin cobertura ─────────────────

-- Mascotas: tier 1 = marcas premium, tier 2 = second tier
INSERT INTO brand_rules (category_key, pattern, tier, priority) VALUES
('mascotas', '%whiskas%',  1, 10),
('mascotas', '%pedigree%', 1, 10),
('mascotas', '%purina%',   1, 10),
('mascotas', '%iams%',     1, 10),
('mascotas', '%felix%',    1, 9),
('mascotas', '%dog chow%', 1, 9),
('mascotas', '%friskies%', 2, 10),
('mascotas', '%chef%',     2, 9),
('mascotas', '%master%',   2, 9),

-- Desayuno: café
('desayuno', '%nescafe%',    1, 10),
('desayuno', '%la virginia%',1, 10),
('desayuno', '%cabrales%',   1, 10),
('desayuno', '%nesquik%',    1, 10),
('desayuno', '%jacobs%',     1, 9),
('desayuno', '%la morenita%',2, 10),

-- Bebidas: jugos
('bebidas', '%tang%',    1, 10),
('bebidas', '%cepita%',  1, 10),
('bebidas', '%ades%',    1, 9),
('bebidas', '%minute%',  1, 9),

-- Farmacia (vitaminas/suplementos tier 1)
('farmacia', '%centrum%',   1, 10),
('farmacia', '%redoxon%',   1, 10),
('farmacia', '%nature%',    1, 9),
('farmacia', '%pharmaton%', 1, 9),

-- Azúcar: tier 1 = Ledesma, tier 2 = Chango/Azucel — evita colisión con "café con azúcar"
('almacen', '%ledesma%',  1, 10),
('almacen', '%chango%',   2, 10),
('almacen', '%azucel%',   2,  9),

-- Agua mineral: Villavicencio=tier1, Ser=tier2
('bebidas', '%villavicencio%', 1, 10),
('bebidas', '%ser%',           2, 10);

-- ─── Aplicar brand_rules retroactivamente a productos sin brand_tier ──────
-- Las brand_rules nuevas (Chango, Ser, mascotas, etc.) no afectan productos ya
-- sincronizados. Este UPDATE las aplica al inventario existente.
UPDATE products
SET brand_tier = subq.tier
FROM (
  SELECT DISTINCT ON (p.id)
    p.id,
    br.tier
  FROM products p
  JOIN brand_rules br
    ON p.category_key = br.category_key
    AND translate(lower(p.name), 'áéíóúüñàèìòù', 'aeiouunaeiou') ILIKE br.pattern
  WHERE p.brand_tier IS NULL
  ORDER BY p.id, br.priority DESC, br.tier ASC
) subq
WHERE products.id = subq.id;
