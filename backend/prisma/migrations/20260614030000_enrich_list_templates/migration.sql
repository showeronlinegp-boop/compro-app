-- ═══════════════════════════════════════════════════════════════════════════
-- Enrich list_templates: núcleo común completo + capas de perfil + módulos
-- Fuente: canastas_default_por_perfil.md
--
-- Fórmula: (NÚCLEO × hogar.tamano) + CAPA[perfil] + MÓDULOS activos
-- Categorías disponibles: carnes, fiambres, frutas-verduras, panaderia,
--   congelados, alcohol, almacen, lacteos, bebidas, desayuno, limpieza, personal
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO list_templates
  (perfil_hogar, category_key, item_name, qty_base, scale_per_person, frequency_days,
   requires_module, search_keyword, size_hint)
VALUES

-- ─────────────────────────────────────────────────────────────────────────────
-- SECCIÓN 1 — ALMACÉN / DESPENSA
-- Ítems faltantes del núcleo común (aceite/arroz/fideos/yerba ya existen en 020)
-- ─────────────────────────────────────────────────────────────────────────────

-- Harina (faltaba en joven_solo y adultos_mayores)
('joven_solo',       'almacen', 'Harina',            1, 0.00,  30, NULL, 'harina',       '1 kg'),
('adultos_mayores',  'almacen', 'Harina',            1, 0.00,  30, NULL, 'harina',       '1 kg'),

-- Sal fina
('joven_solo',       'almacen', 'Sal fina',          1, 0.00,  90, NULL, 'sal fina',     NULL),
('pareja',           'almacen', 'Sal fina',          1, 0.00,  90, NULL, 'sal fina',     NULL),
('familia_con_ninos','almacen', 'Sal fina',          1, 0.25,  90, NULL, 'sal fina',     NULL),
('adultos_mayores',  'almacen', 'Sal fina',          1, 0.00,  90, NULL, 'sal fina',     NULL),

-- Salsa / puré de tomate (~3 latas/persona/mes)
('joven_solo',       'almacen', 'Salsa de tomate',   2, 0.00,  30, NULL, 'tomate',       '520'),
('pareja',           'almacen', 'Salsa de tomate',   3, 0.00,  30, NULL, 'tomate',       '520'),
('familia_con_ninos','almacen', 'Salsa de tomate',   2, 1.00,  30, NULL, 'tomate',       '520'),
('adultos_mayores',  'almacen', 'Salsa de tomate',   2, 0.00,  30, NULL, 'tomate',       '520'),

-- Atún / caballa en lata (~2/persona/mes)
('joven_solo',       'almacen', 'Atún en lata',      2, 0.00,  30, NULL, 'atun',         NULL),
('pareja',           'almacen', 'Atún en lata',      3, 0.00,  30, NULL, 'atun',         NULL),
('familia_con_ninos','almacen', 'Atún en lata',      2, 0.50,  30, NULL, 'atun',         NULL),
('adultos_mayores',  'almacen', 'Atún en lata',      3, 0.00,  30, NULL, 'atun',         NULL),

-- Legumbres (lentejas / arvejas — clave en familia numerosa, Perfil C)
('joven_solo',       'almacen', 'Lentejas',          1, 0.00,  30, NULL, 'lentejas',     NULL),
('pareja',           'almacen', 'Lentejas',          2, 0.00,  30, NULL, 'lentejas',     NULL),
('familia_con_ninos','almacen', 'Lentejas',          2, 0.50,  30, NULL, 'lentejas',     NULL),
('adultos_mayores',  'almacen', 'Lentejas',          2, 0.00,  30, NULL, 'lentejas',     NULL),

-- Polenta (rendidora, escala fuerte en familias grandes)
('joven_solo',       'almacen', 'Polenta',           1, 0.00,  30, NULL, 'polenta',      '500'),
('pareja',           'almacen', 'Polenta',           1, 0.00,  30, NULL, 'polenta',      '500'),
('familia_con_ninos','almacen', 'Polenta',           1, 0.50,  30, NULL, 'polenta',      '500'),
('adultos_mayores',  'almacen', 'Polenta',           1, 0.00,  30, NULL, 'polenta',      '500'),

-- Sopas instantáneas / caldos (almacén — VTEX "Caldos, Sopas Y Pure")
('joven_solo',       'almacen', 'Sopas instantáneas',2, 0.00,  14, NULL, 'sopa',         NULL),

-- ─────────────────────────────────────────────────────────────────────────────
-- SECCIÓN 2 — LÁCTEOS Y FRESCOS
-- ─────────────────────────────────────────────────────────────────────────────

-- Queso cremoso (semanal, faltaba en todos)
('joven_solo',       'lacteos', 'Queso cremoso',     1, 0.00,  14, NULL, 'queso',        '250'),
('pareja',           'lacteos', 'Queso cremoso',     1, 0.00,  14, NULL, 'queso',        '250'),
('familia_con_ninos','lacteos', 'Queso cremoso',     1, 0.50,  14, NULL, 'queso',        '250'),
('adultos_mayores',  'lacteos', 'Queso cremoso',     1, 0.00,  14, NULL, 'queso',        '250'),

-- Manteca (quincenal)
('joven_solo',       'lacteos', 'Manteca',           1, 0.00,  30, NULL, 'manteca',      '200'),
('pareja',           'lacteos', 'Manteca',           1, 0.00,  30, NULL, 'manteca',      '200'),
('familia_con_ninos','lacteos', 'Manteca',           1, 0.25,  30, NULL, 'manteca',      '200'),
('adultos_mayores',  'lacteos', 'Manteca',           1, 0.00,  30, NULL, 'manteca',      '200'),

-- Dulce de leche (mensual, icónico argentino)
('joven_solo',       'lacteos', 'Dulce de leche',    1, 0.00,  30, NULL, 'dulce de leche','400'),
('pareja',           'lacteos', 'Dulce de leche',    1, 0.00,  30, NULL, 'dulce de leche','400'),
('familia_con_ninos','lacteos', 'Dulce de leche',    1, 0.25,  30, NULL, 'dulce de leche','400'),
('adultos_mayores',  'lacteos', 'Dulce de leche',    1, 0.00,  30, NULL, 'dulce de leche','400'),

-- Huevos (en VTEX están en la categoría Lácteos → slug: lacteos)
('joven_solo',       'lacteos', 'Huevos',            1, 0.00,  14, NULL, 'huevo',        '6'),
('pareja',           'lacteos', 'Huevos',            2, 0.00,  14, NULL, 'huevo',        NULL),
('familia_con_ninos','lacteos', 'Huevos',            2, 0.50,  14, NULL, 'huevo',        NULL),
('adultos_mayores',  'lacteos', 'Huevos',            2, 0.00,  14, NULL, 'huevo',        NULL),

-- ─────────────────────────────────────────────────────────────────────────────
-- SECCIÓN 3 — CARNES Y PROTEÍNAS
-- ─────────────────────────────────────────────────────────────────────────────

-- Carne picada / vacuna (~3 kg/persona/mes)
('joven_solo',       'carnes',  'Carne picada',      1, 0.00,  7,  NULL, 'carne picada', NULL),
('pareja',           'carnes',  'Carne picada',      1, 0.00,  7,  NULL, 'carne picada', NULL),
('familia_con_ninos','carnes',  'Carne picada',      1, 0.50,  7,  NULL, 'carne picada', NULL),
('adultos_mayores',  'carnes',  'Carne picada',      1, 0.00,  7,  NULL, 'carne picada', NULL),

-- Pollo (~2 kg/persona/mes)
('joven_solo',       'carnes',  'Pollo',             1, 0.00,  7,  NULL, 'pollo',        NULL),
('pareja',           'carnes',  'Pollo',             1, 0.00,  7,  NULL, 'pollo',        NULL),
('familia_con_ninos','carnes',  'Pollo',             1, 0.50,  7,  NULL, 'pollo',        NULL),
('adultos_mayores',  'carnes',  'Pollo',             1, 0.00,  7,  NULL, 'pollo',        NULL),

-- Fiambre (paleta cocida / salame — 1 paq por hogar, semanal)
('joven_solo',       'fiambres','Fiambre',           1, 0.00,  14, NULL, 'paleta',       '250'),
('pareja',           'fiambres','Fiambre',           1, 0.00,  7,  NULL, 'paleta',       '250'),
('familia_con_ninos','fiambres','Fiambre',           1, 0.25,  7,  NULL, 'paleta',       '250'),
('adultos_mayores',  'fiambres','Fiambre',           1, 0.00,  14, NULL, 'paleta',       '250'),

-- ─────────────────────────────────────────────────────────────────────────────
-- SECCIÓN 4 — FRUTAS Y VERDURAS
-- ─────────────────────────────────────────────────────────────────────────────

-- Papa (~3 kg/persona/mes, semanal)
('joven_solo',       'frutas-verduras','Papa',       1, 0.00,  7,  NULL, 'papa',         NULL),
('pareja',           'frutas-verduras','Papa',       2, 0.00,  7,  NULL, 'papa',         NULL),
('familia_con_ninos','frutas-verduras','Papa',       2, 0.50,  7,  NULL, 'papa',         NULL),
('adultos_mayores',  'frutas-verduras','Papa',       1, 0.00,  7,  NULL, 'papa',         NULL),

-- Cebolla (base de cocina, semanal)
('joven_solo',       'frutas-verduras','Cebolla',   1, 0.00,  7,  NULL, 'cebolla',      NULL),
('pareja',           'frutas-verduras','Cebolla',   1, 0.00,  7,  NULL, 'cebolla',      NULL),
('familia_con_ninos','frutas-verduras','Cebolla',   1, 0.25,  7,  NULL, 'cebolla',      NULL),
('adultos_mayores',  'frutas-verduras','Cebolla',   1, 0.00,  7,  NULL, 'cebolla',      NULL),

-- Tomate fresco (distinto de salsa enlatada)
('joven_solo',       'frutas-verduras','Tomate',    1, 0.00,  7,  NULL, 'tomate',       NULL),
('pareja',           'frutas-verduras','Tomate',    1, 0.00,  7,  NULL, 'tomate',       NULL),
('familia_con_ninos','frutas-verduras','Tomate',    1, 0.25,  7,  NULL, 'tomate',       NULL),
('adultos_mayores',  'frutas-verduras','Tomate',    1, 0.00,  7,  NULL, 'tomate',       NULL),

-- Zanahoria
('joven_solo',       'frutas-verduras','Zanahoria', 1, 0.00,  7,  NULL, 'zanahoria',    NULL),
('pareja',           'frutas-verduras','Zanahoria', 1, 0.00,  7,  NULL, 'zanahoria',    NULL),
('familia_con_ninos','frutas-verduras','Zanahoria', 1, 0.25,  7,  NULL, 'zanahoria',    NULL),
('adultos_mayores',  'frutas-verduras','Zanahoria', 1, 0.00,  7,  NULL, 'zanahoria',    NULL),

-- Verdura de hoja (lechuga / acelga)
('joven_solo',       'frutas-verduras','Lechuga',   1, 0.00,  7,  NULL, 'lechuga',      NULL),
('pareja',           'frutas-verduras','Lechuga',   1, 0.00,  7,  NULL, 'lechuga',      NULL),
('familia_con_ninos','frutas-verduras','Lechuga',   1, 0.25,  7,  NULL, 'lechuga',      NULL),
('adultos_mayores',  'frutas-verduras','Lechuga',   1, 0.00,  7,  NULL, 'lechuga',      NULL),

-- Frutas (banana / manzana / cítricos, semanal)
('joven_solo',       'frutas-verduras','Banana',    1, 0.00,  7,  NULL, 'banana',       NULL),
('pareja',           'frutas-verduras','Banana',    2, 0.00,  7,  NULL, 'banana',       NULL),
('familia_con_ninos','frutas-verduras','Banana',    2, 0.50,  7,  NULL, 'banana',       NULL),
('adultos_mayores',  'frutas-verduras','Banana',    2, 0.00,  7,  NULL, 'banana',       NULL),

('joven_solo',       'frutas-verduras','Manzana',   1, 0.00,  7,  NULL, 'manzana',      NULL),
('pareja',           'frutas-verduras','Manzana',   1, 0.00,  7,  NULL, 'manzana',      NULL),
('familia_con_ninos','frutas-verduras','Manzana',   1, 0.25,  7,  NULL, 'manzana',      NULL),
('adultos_mayores',  'frutas-verduras','Manzana',   2, 0.00,  7,  NULL, 'manzana',      NULL),

-- Zapallo (surtido de verduras del núcleo; faltaba)
('joven_solo',       'frutas-verduras','Zapallo',    1, 0.00,  7,  NULL, 'zapallo',      NULL),
('pareja',           'frutas-verduras','Zapallo',    1, 0.00,  7,  NULL, 'zapallo',      NULL),
('familia_con_ninos','frutas-verduras','Zapallo',    1, 0.25,  7,  NULL, 'zapallo',      NULL),
('adultos_mayores',  'frutas-verduras','Zapallo',    1, 0.00,  7,  NULL, 'zapallo',      NULL),

-- Naranja / cítricos
('joven_solo',       'frutas-verduras','Naranja',    1, 0.00,  7,  NULL, 'naranja',      NULL),
('pareja',           'frutas-verduras','Naranja',    2, 0.00,  7,  NULL, 'naranja',      NULL),
('familia_con_ninos','frutas-verduras','Naranja',    2, 0.50,  7,  NULL, 'naranja',      NULL),
('adultos_mayores',  'frutas-verduras','Naranja',    2, 0.00,  7,  NULL, 'naranja',      NULL),

-- ─────────────────────────────────────────────────────────────────────────────
-- SECCIÓN 5 — PANADERÍA
-- ─────────────────────────────────────────────────────────────────────────────

-- Pan lactal (para todos; adultos_mayores prioriza este formato)
('joven_solo',       'panaderia','Pan lactal',       1, 0.00,  7,  NULL, 'lactal',       NULL),
('pareja',           'panaderia','Pan lactal',       1, 0.00,  7,  NULL, 'lactal',       NULL),
('familia_con_ninos','panaderia','Pan lactal',       1, 0.25,  7,  NULL, 'lactal',       NULL),
('adultos_mayores',  'panaderia','Pan lactal',       2, 0.00,  7,  NULL, 'lactal',       NULL),

-- ─────────────────────────────────────────────────────────────────────────────
-- SECCIÓN 6 — BEBIDAS
-- ─────────────────────────────────────────────────────────────────────────────

-- Gaseosa para joven_solo (faltaba; adultos_mayores no la tiene — reduce azucaradas)
('joven_solo',       'bebidas', 'Gaseosa',           2, 0.00,  14, NULL, 'gaseosa',      '1,5'),

-- ─────────────────────────────────────────────────────────────────────────────
-- SECCIÓN 7 — BEBIDAS CON ALCOHOL  (categoría: alcohol)
-- Cerveza va aquí — VTEX "Cervezas" → slug "alcohol", no "bebidas"
-- ─────────────────────────────────────────────────────────────────────────────

('joven_solo',       'alcohol', 'Cerveza',           3, 0.00,  14, NULL, 'cerveza',      NULL),

-- ─────────────────────────────────────────────────────────────────────────────
-- SECCIÓN 8 — CONGELADOS
-- ─────────────────────────────────────────────────────────────────────────────

-- Medallones de pollo / congelados (Perfil A: practicidad)
('joven_solo',       'congelados','Medallones de pollo',2,0.00, 14, NULL, 'medallon',    NULL),

-- ─────────────────────────────────────────────────────────────────────────────
-- SECCIÓN 9 — DESAYUNO Y MERIENDA
-- ─────────────────────────────────────────────────────────────────────────────

-- Café (faltaba en todos los perfiles)
('joven_solo',       'desayuno','Café',              1, 0.00,  30, NULL, 'cafe',         NULL),
('pareja',           'desayuno','Café',              1, 0.00,  30, NULL, 'cafe',         NULL),
('familia_con_ninos','desayuno','Café',              1, 0.00,  30, NULL, 'cafe',         NULL),
('adultos_mayores',  'desayuno','Café',              1, 0.00,  30, NULL, 'cafe',         NULL),

-- Snacks (Perfil A — VTEX "Snacks" → slug "desayuno")
('joven_solo',       'desayuno','Snacks',            2, 0.00,  14, NULL, 'papa frita',   NULL),

-- Mermelada (desayuno familiar)
('pareja',           'desayuno','Mermelada',         1, 0.00,  30, NULL, 'mermelada',    NULL),
('familia_con_ninos','desayuno','Mermelada',         1, 0.25,  30, NULL, 'mermelada',    NULL),

-- Ítems específicos chicos (requires_module: chicos)
('familia_con_ninos','desayuno','Alfajores',         2, 0.50,  14, 'chicos', 'alfajor',  NULL),

-- Avena y té para adultos mayores (pan lactal va en sección 5 — panaderia)
('adultos_mayores',  'desayuno','Avena',             1, 0.00,  30, NULL, 'avena',        NULL),
('adultos_mayores',  'desayuno','Té / Infusiones',   1, 0.00,  30, NULL, 'saquito',      NULL),

-- ─────────────────────────────────────────────────────────────────────────────
-- SECCIÓN 10 — LIMPIEZA
-- ─────────────────────────────────────────────────────────────────────────────

-- Jabón para ropa (faltaba en joven_solo)
('joven_solo',       'limpieza','Jabón en polvo',    1, 0.00,  30, NULL, 'jabon',        NULL),

-- Suavizante ropa (faltaba en joven_solo y adultos_mayores)
('joven_solo',       'limpieza','Suavizante ropa',   1, 0.00,  30, NULL, 'suavizante',   NULL),
('adultos_mayores',  'limpieza','Suavizante ropa',   1, 0.00,  30, NULL, 'suavizante',   NULL),

-- Esponja (faltaba en todos los perfiles)
('joven_solo',       'limpieza','Esponja',           1, 0.00,  30, NULL, 'esponja',      NULL),
('pareja',           'limpieza','Esponja',           1, 0.00,  30, NULL, 'esponja',      NULL),
('familia_con_ninos','limpieza','Esponja',           1, 0.00,  30, NULL, 'esponja',      NULL),
('adultos_mayores',  'limpieza','Esponja',           1, 0.00,  30, NULL, 'esponja',      NULL),

-- ─────────────────────────────────────────────────────────────────────────────
-- SECCIÓN 11 — CUIDADO PERSONAL
-- ─────────────────────────────────────────────────────────────────────────────

-- Acondicionador (faltaba en todos)
('joven_solo',       'personal','Acondicionador',    1, 0.00,  60, NULL, 'acondicionador',NULL),
('pareja',           'personal','Acondicionador',    2, 0.00,  60, NULL, 'acondicionador',NULL),
('familia_con_ninos','personal','Acondicionador',    1, 0.50,  60, NULL, 'acondicionador',NULL),
('adultos_mayores',  'personal','Acondicionador',    1, 0.00,  60, NULL, 'acondicionador',NULL),

-- Cepillo dental (faltaba en todos)
('joven_solo',       'personal','Cepillo dental',    1, 0.00,  90, NULL, 'cepillo dental',NULL),
('pareja',           'personal','Cepillo dental',    2, 0.00,  90, NULL, 'cepillo dental',NULL),
('familia_con_ninos','personal','Cepillo dental',    1, 0.50,  90, NULL, 'cepillo dental',NULL),
('adultos_mayores',  'personal','Cepillo dental',    1, 0.00,  90, NULL, 'cepillo dental',NULL),

-- ─────────────────────────────────────────────────────────────────────────────
-- SECCIÓN 12 — LÁCTEOS PERFIL B (con chicos)
-- ─────────────────────────────────────────────────────────────────────────────

('familia_con_ninos','lacteos', 'Queso untable',     1, 0.00,  30, 'chicos', 'untable',      NULL),
('familia_con_ninos','lacteos', 'Yogur bebible',     2, 0.50,  14, 'chicos', 'yogur bebible', NULL),

-- ─────────────────────────────────────────────────────────────────────────────
-- SECCIÓN 13 — ALMACÉN PERFIL B Y D
-- ─────────────────────────────────────────────────────────────────────────────

('familia_con_ninos','almacen', 'Hamburguesas',      1, 0.25,  14, 'chicos', 'hamburguesa', NULL),
('adultos_mayores',  'almacen', 'Edulcorante',       1, 0.00,  30, NULL, 'edulcorante',  NULL),

-- ─────────────────────────────────────────────────────────────────────────────
-- SECCIÓN 14 — MÓDULOS ADD-ON: gestión menstrual y afeitado
-- Activados por shouldIncludeItem según genero del perfil
-- ─────────────────────────────────────────────────────────────────────────────

('joven_solo',       'personal','Toallitas femeninas',2, 0.00, 30, 'gestion_menstrual','toallita',       NULL),
('pareja',           'personal','Toallitas femeninas',2, 0.00, 30, 'gestion_menstrual','toallita',       NULL),
('familia_con_ninos','personal','Toallitas femeninas',2, 0.00, 30, 'gestion_menstrual','toallita',       NULL),
('adultos_mayores',  'personal','Toallitas femeninas',2, 0.00, 30, 'gestion_menstrual','toallita',       NULL),

('joven_solo',       'personal','Maquinita de afeitar',1,0.00, 30, 'afeitado','afeitar',               NULL),
('joven_solo',       'personal','Espuma de afeitar',  1, 0.00, 30, 'afeitado','espuma afeitar',        NULL),
('pareja',           'personal','Maquinita de afeitar',1,0.00, 30, 'afeitado','afeitar',               NULL),
('pareja',           'personal','Espuma de afeitar',  1, 0.00, 30, 'afeitado','espuma afeitar',        NULL),
('familia_con_ninos','personal','Maquinita de afeitar',1,0.00, 30, 'afeitado','afeitar',               NULL),
('familia_con_ninos','personal','Espuma de afeitar',  1, 0.00, 30, 'afeitado','espuma afeitar',        NULL),
('adultos_mayores',  'personal','Maquinita de afeitar',1,0.00, 30, 'afeitado','afeitar',               NULL),
('adultos_mayores',  'personal','Espuma de afeitar',  1, 0.00, 30, 'afeitado','espuma afeitar',        NULL);

-- ═══════════════════════════════════════════════════════════════════════════
-- Brand rules para categorías sin cobertura
-- lacteos y personal: cero reglas hasta ahora → siempre caía a tier 2
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO brand_rules (category_key, pattern, tier, priority) VALUES

-- ─── Lácteos (leche, queso, yogur, manteca, dulce de leche, huevos) ───────
('lacteos', '%serenisima%',    1, 10),
('lacteos', '%sancor%',        1, 10),
('lacteos', '%mastellone%',    1,  9),
('lacteos', '%vacalin%',       1,  9),
('lacteos', '%milkaut%',       1,  9),
('lacteos', '%ilolay%',        2, 10),
('lacteos', '%tregar%',        2, 10),
('lacteos', '%la paulina%',    2,  9),
('lacteos', '%mendicrim%',     2,  9),

-- ─── Personal — shampoo / acondicionador ─────────────────────────────────
('personal', '%sedal%',        1, 10),
('personal', '%pantene%',      1, 10),
('personal', '%dove%',         1, 10),
('personal', '%head%',         1,  9),
('personal', '%plusbelle%',    2, 10),
('personal', '%tio nacho%',    2, 10),

-- ─── Personal — desodorante ───────────────────────────────────────────────
('personal', '%rexona%',       1, 10),
('personal', '%axe%',          1,  9),
('personal', '%nivea%',        1,  9),

-- ─── Personal — pasta dental / cepillo ───────────────────────────────────
('personal', '%oral b%',       1, 10),
('personal', '%colgate%',      1, 10),
('personal', '%sensodyne%',    1,  9),

-- ─── Personal — jabón tocador ─────────────────────────────────────────────
('personal', '%palmolive%',    1,  9),

-- ─── Personal — toallitas femeninas ──────────────────────────────────────
('personal', '%always%',       1, 10),
('personal', '%nosotras%',     1, 10),
('personal', '%kotex%',        1,  9),

-- ─── Personal — afeitado ──────────────────────────────────────────────────
('personal', '%gillette%',     1, 10),
('personal', '%schick%',       1,  9),
('personal', '%bic%',          2,  9),

-- ─── Bebidas con alcohol (cerveza) ────────────────────────────────────────
('alcohol', '%quilmes%',       1, 10),
('alcohol', '%brahma%',        1, 10),
('alcohol', '%heineken%',      1,  9),
('alcohol', '%stella artois%', 1,  9),
('alcohol', '%schneider%',     2, 10),
('alcohol', '%imperial%',      2,  9),

-- ─── Fiambres ─────────────────────────────────────────────────────────────
('fiambres', '%fargo%',        1, 10),
('fiambres', '%paladini%',     1, 10),
('fiambres', '%la salamandra%',1,  9),
('fiambres', '%coto%',         2,  9),

-- ─── Panadería ────────────────────────────────────────────────────────────
('panaderia', '%bimbo%',       1, 10),
('panaderia', '%schulz%',      2, 10),
('panaderia', '%lactal%',      1,  9),

-- ─── Desayuno — café (adición a las reglas de 010/020) ───────────────────
('desayuno', '%dolca%',        1, 10),
('desayuno', '%lipton%',       1, 10),

-- ─── Desayuno — mermelada ─────────────────────────────────────────────────
('desayuno', '%la consagrada%',1, 10),
('desayuno', '%dulcor%',       2, 10),

-- ─── Desayuno — avena ────────────────────────────────────────────────────
('desayuno', '%quaker%',       1, 10),
('desayuno', '%granix%',       2, 10),

-- ─── Almacén — atún ───────────────────────────────────────────────────────
('almacen', '%van camps%',     1, 10),
('almacen', '%carolina%',      1,  9),
('almacen', '%cuisine%',       2, 10),

-- ─── Almacén — sal ────────────────────────────────────────────────────────
('almacen', '%dos anclas%',    1, 10),
('almacen', '%crisal%',        2, 10),

-- ─── Almacén — edulcorante ────────────────────────────────────────────────
('almacen', '%ta te ti%',      1, 10),
('almacen', '%dulkamara%',     2, 10);

-- ─── Aplicar todas las brand_rules nuevas a productos existentes sin tier ──
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
