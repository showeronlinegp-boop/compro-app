-- ═══════════════════════════════════════════════════════════════════════════
-- Matching rules per list_template item
-- Ported from diccionario_matching.js (App Neggo)
--   incluye        : ALL terms must appear in product name (AND)
--   requiere_alguno: at least ONE must appear (OR) — defines correct "type"
--   excluye        : any match → hard discard
--   veta           : soft discard unless tier=1 (premium)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE list_templates
  ADD COLUMN incluye         JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN requiere_alguno JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN excluye         JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN veta            JSONB NOT NULL DEFAULT '[]';

-- ─── ALMACÉN ────────────────────────────────────────────────────────────────

UPDATE list_templates SET
  incluye         = '["aceite"]',
  requiere_alguno = '["girasol"]',
  excluye         = '["oliva","mezcla","maiz","maíz","uva","aerosol","rocio","rocío","spray","canola"]',
  veta            = '["organico","orgánico","gourmet"]'
WHERE item_name = 'Aceite de girasol';

UPDATE list_templates SET
  incluye         = '["arroz"]',
  requiere_alguno = '["doble carolina","largo fino","parboil","00000","grano"]',
  excluye         = '["harina de arroz","leche de arroz","integral","yamani","galleta","aperitivo"]',
  veta            = '["organico","orgánico","integral","yamani","arborio","basmati"]'
WHERE item_name = 'Arroz';

UPDATE list_templates SET
  incluye         = '["fideos"]',
  requiere_alguno = '["guisero","tirabuzon","tirabuzón","mostachol","tallarin","tallarín","codito","spaghetti","dedalitos","munición","secos"]',
  excluye         = '["frescos","al huevo premium","rellenos","sopa","instantaneo","instantáneo","arroz"]',
  veta            = '["sin tacc","sin t.a.c.c","legumbres","integral","organico","orgánico"]'
WHERE item_name = 'Fideos secos';

UPDATE list_templates SET
  incluye         = '["harina"]',
  requiere_alguno = '["000","0000","leudante","trigo","común","comun"]',
  excluye         = '["arroz","almendra","maiz","maíz","garbanzo","avena","coco","integral","premezcla"]',
  veta            = '["sin tacc","sin t.a.c.c","organico","orgánico","integral"]'
WHERE item_name IN ('Harina de trigo', 'Harina');

UPDATE list_templates SET
  incluye         = '["azucar"]',
  requiere_alguno = '["comun","común","blanca","refinada","tipo a"]',
  excluye         = '["impalpable","edulcorante","glas"]',
  veta            = '["mascabo","rubia","organica","orgánica","integral","light"]'
WHERE item_name = 'Azúcar';

UPDATE list_templates SET
  incluye         = '["yerba"]',
  requiere_alguno = '["mate","con palo","sin palo","elaborada"]',
  excluye         = '["mate cocido","saborizada premium","compuesta hierbas serranas"]',
  veta            = '["organica","orgánica","barista","premium"]'
WHERE item_name = 'Yerba mate';

UPDATE list_templates SET
  incluye         = '["cafe"]',
  requiere_alguno = '["molido","instantaneo","instantáneo","soluble","torrado","tostado","granos"]',
  excluye         = '["capsula","cápsula","descafeinado","saborizado"]',
  veta            = '["gourmet","premium","origen","organico","orgánico"]'
WHERE item_name = 'Café';

UPDATE list_templates SET
  incluye         = '["sal"]',
  requiere_alguno = '["fina","gruesa","comun","común","parrillera"]',
  excluye         = '["marina premium","rosa","himalaya","escamas","apio"]',
  veta            = '["light","baja en sodio","reducida","rosa","himalaya","gourmet"]'
WHERE item_name = 'Sal fina';

UPDATE list_templates SET
  incluye         = '[]',
  requiere_alguno = '["pure de tomate","puré de tomate","salsa de tomate","tomate triturado","tomate perita lata"]',
  excluye         = '["ketchup","cherry","fresco","seco","al kg"]',
  veta            = '["organico","orgánico","casero artesanal"]'
WHERE item_name = 'Salsa de tomate';

UPDATE list_templates SET
  incluye         = '["atun"]',
  requiere_alguno = '["lata","al natural","aceite","lomitos","rallado"]',
  excluye         = '["fresco","congelado","sushi","paté"]',
  veta            = '["gourmet","premium","aleta amarilla"]'
WHERE item_name = 'Atún en lata';

UPDATE list_templates SET
  incluye         = '[]',
  requiere_alguno = '["lentejas","arvejas","garbanzos","porotos"]',
  excluye         = '["snack","tostadas","harina","hummus"]',
  veta            = '["organico","orgánico","gourmet"]'
WHERE item_name = 'Lentejas';

UPDATE list_templates SET
  incluye         = '["polenta"]',
  requiere_alguno = '["instantanea","instantánea","precocida","comun","común"]',
  excluye         = '["lista para servir","con queso premium"]',
  veta            = '["organica","orgánica"]'
WHERE item_name = 'Polenta';

-- ─── LÁCTEOS ────────────────────────────────────────────────────────────────

UPDATE list_templates SET
  incluye         = '["leche"]',
  requiere_alguno = '["entera","descremada","parcialmente","larga vida","sachet","fluida"]',
  excluye         = '["polvo","condensada","chocolatada","almendra","soja","coco","fórmula","formula","bebe","bebé"]',
  veta            = '["deslactosada premium","a2","organica","orgánica"]'
WHERE item_name = 'Leche';

UPDATE list_templates SET
  incluye         = '["yogur"]',
  requiere_alguno = '["bebible","firme","batido","entero","descremado","familiar","pote"]',
  excluye         = '["griego premium","kefir gourmet","vegetal","soja"]',
  veta            = '["protein","proteico premium","organico","orgánico"]'
WHERE item_name = 'Yogur';

UPDATE list_templates SET
  incluye         = '["queso"]',
  requiere_alguno = '["cremoso","port salut","barra","rallado","maquina","máquina","sandwich"]',
  excluye         = '["burrata","provolone","roquefort","azul","brie","camembert","parmesano premium","gruyere","gorgonzola","ahumado gourmet"]',
  veta            = '["trufa","gourmet","organico","orgánico","artesanal premium"]'
WHERE item_name = 'Queso cremoso';

UPDATE list_templates SET
  incluye         = '[]',
  requiere_alguno = '["manteca","margarina"]',
  excluye         = '["clarificada","ghee","saborizada"]',
  veta            = '["organica","orgánica","premium"]'
WHERE item_name = 'Manteca';

UPDATE list_templates SET
  incluye         = '["dulce de leche"]',
  requiere_alguno = '["clasico","clásico","tradicional","familiar"]',
  excluye         = '["alfajor","helado","galleta"]',
  veta            = '["repostero","colonial premium","gourmet"]'
WHERE item_name = 'Dulce de leche';

UPDATE list_templates SET
  incluye         = '["huevos"]',
  requiere_alguno = '["blancos","color","docena","maple","x 6","x 12","x 30"]',
  excluye         = '["codorniz","pascua","chocolate","liquido","líquido","en polvo"]',
  veta            = '["organicos","orgánicos","omega","camperos premium"]'
WHERE item_name = 'Huevos';

-- ─── CARNES / FIAMBRES ──────────────────────────────────────────────────────

UPDATE list_templates SET
  incluye         = '["picada"]',
  requiere_alguno = '["carne","comun","común","especial","magra","vacuna"]',
  excluye         = '["pollo","cerdo","soja","vegetal","plant","hamburguesa armada","medallon","medallón"]',
  veta            = '["premium wagyu","angus premium"]'
WHERE item_name = 'Carne picada';

UPDATE list_templates SET
  incluye         = '["pollo"]',
  requiere_alguno = '["entero","pata","muslo","pechuga","suprema","trozado","fresco"]',
  excluye         = '["nugget","milanesa","rebozad","patitas","medallon","medallón","empanado","arrollado","fiambre","pate","paté"]',
  veta            = '["organico","orgánico","campero premium"]'
WHERE item_name = 'Pollo';

UPDATE list_templates SET
  incluye         = '[]',
  requiere_alguno = '["paleta","jamon cocido","jamón cocido","salame","mortadela","salchichon","salchichón"]',
  excluye         = '["crudo premium","serrano","iberico","ibérico","bondiola premium","pancetta gourmet"]',
  veta            = '["gourmet","premium","curado de bellota"]'
WHERE item_name = 'Fiambre';

-- ─── FRUTAS Y VERDURAS ──────────────────────────────────────────────────────

UPDATE list_templates SET
  incluye         = '["papa"]',
  requiere_alguno = '["x kg","blanca","negra","comun","común","bolsa","a granel"]',
  excluye         = '["batata","andina premium","noisette","bastón","baston","congelad","chips","puré","pure","deshidratada"]',
  veta            = '["andina","gourmet","baby"]'
WHERE item_name = 'Papa';

UPDATE list_templates SET
  incluye         = '["cebolla"]',
  requiere_alguno = '["x kg","comun","común","blanca","morada","a granel"]',
  excluye         = '["mix","tarta","congelad","deshidratada","en polvo","frita","aros"]',
  veta            = '["baby","gourmet"]'
WHERE item_name = 'Cebolla';

UPDATE list_templates SET
  incluye         = '["tomate"]',
  requiere_alguno = '["x kg","redondo","perita","comun","común","a granel"]',
  excluye         = '["cherry","seco","lata","pure","puré","triturado","deshidratado","confit"]',
  veta            = '["cherry","gourmet","orgánico","organico"]'
WHERE item_name = 'Tomate';

UPDATE list_templates SET
  incluye         = '["zapallo"]',
  requiere_alguno = '["x kg","anco","criollo","kabutia","plomo","a granel"]',
  excluye         = '["semilla","congelad","cubos premium","pure","puré","deshidratado"]',
  veta            = '["gourmet","baby"]'
WHERE item_name = 'Zapallo';

UPDATE list_templates SET
  incluye         = '[]',
  requiere_alguno = '["lechuga","acelga","espinaca"]',
  excluye         = '["baby premium","rucula gourmet","rúcula gourmet","hidroponica gourmet","mix premium","bowl"]',
  veta            = '["baby","gourmet","mix premium","orgánico","organico"]'
WHERE item_name = 'Lechuga';

UPDATE list_templates SET
  incluye         = '["banana"]',
  requiere_alguno = '["x kg","ecuador","comun","común","a granel"]',
  excluye         = '["chips","deshidratada","pure","puré","snack","liofilizada"]',
  veta            = '["gourmet","orgánica","organica"]'
WHERE item_name = 'Banana';

UPDATE list_templates SET
  incluye         = '["manzana"]',
  requiere_alguno = '["x kg","roja","verde","red","granny","a granel"]',
  excluye         = '["chips","deshidratada","pure","puré","snack","jugo"]',
  veta            = '["gourmet","orgánica","organica"]'
WHERE item_name = 'Manzana';

UPDATE list_templates SET
  incluye         = '[]',
  requiere_alguno = '["naranja","mandarina"]',
  excluye         = '["batata","jugo de naranja","jugo exprimido","en polvo","mermelada","esencia","confitada","pulpa premium"]',
  veta            = '["gourmet","orgánica","organica"]'
WHERE item_name = 'Naranja';

-- ─── PANADERÍA ──────────────────────────────────────────────────────────────

UPDATE list_templates SET
  incluye         = '["pan"]',
  requiere_alguno = '["lactal","frances","francés","flauta","mignon","salvado","molde"]',
  excluye         = '["rallado","tostadas premium","brioche gourmet","arabe gourmet"]',
  veta            = '["gourmet","sin tacc","sin t.a.c.c","keto","proteico"]'
WHERE item_name = 'Pan lactal';

UPDATE list_templates SET
  incluye         = '["galletit"]',
  requiere_alguno = '["agua","crackers","dulces","vainilla","rellenas","salvado","surtidas"]',
  excluye         = '["havanna","premium importada","gourmet"]',
  veta            = '["havanna","gourmet","premium","sin tacc","sin t.a.c.c","keto"]'
WHERE item_name = 'Galletitas';

-- ─── BEBIDAS ────────────────────────────────────────────────────────────────

UPDATE list_templates SET
  incluye         = '["agua"]',
  requiere_alguno = '["mineral","sin gas","manantial","bidon","bidón","botella"]',
  excluye         = '["con gas premium","saborizada","tonica","tónica","destilada"]',
  veta            = '["premium importada","gourmet"]'
WHERE item_name = 'Agua sin gas';

UPDATE list_templates SET
  incluye         = '[]',
  requiere_alguno = '["gaseosa","cola","lima limon","lima limón","naranja","pomelo"]',
  excluye         = '["energizante","isotonica","isotónica","agua tonica","agua tónica"]',
  veta            = '[]'
WHERE item_name = 'Gaseosa';

-- ─── LIMPIEZA ───────────────────────────────────────────────────────────────

UPDATE list_templates SET
  incluye         = '["lavandina"]',
  requiere_alguno = '["comun","común","tradicional","anti-splash","concentrada"]',
  excluye         = '["perfumada premium","gel para baño"]',
  veta            = '["premium"]'
WHERE item_name = 'Lavandina';

UPDATE list_templates SET
  incluye         = '[]',
  requiere_alguno = '["lavavajillas","detergente"]',
  excluye         = '["lavarropas","ropa","maquina","máquina","tabletas"]',
  veta            = '["premium importado"]'
WHERE item_name = 'Detergente vajilla';

UPDATE list_templates SET
  incluye         = '[]',
  requiere_alguno = '["jabon en polvo","jabón en polvo","jabon liquido","jabón líquido","lavarropas","para ropa"]',
  excluye         = '["tocador","manos","vajilla","barra para el cuerpo"]',
  veta            = '["premium importado"]'
WHERE item_name = 'Jabón en polvo';

UPDATE list_templates SET
  incluye         = '["suavizante"]',
  requiere_alguno = '["ropa","concentrado","brisa","clasico","clásico"]',
  excluye         = '[]',
  veta            = '["premium importado"]'
WHERE item_name IN ('Suavizante de ropa', 'Suavizante ropa');

UPDATE list_templates SET
  incluye         = '[]',
  requiere_alguno = '["limpiador","multiuso","pisos","desengrasante"]',
  excluye         = '["inodoro gel premium","horno especializado"]',
  veta            = '["premium importado"]'
WHERE item_name = 'Limpiador';

UPDATE list_templates SET
  incluye         = '["esponja"]',
  requiere_alguno = '["cocina","doble","comun","común","multiuso","pack"]',
  excluye         = '["scrub mommy","scrub daddy","importada","maquillaje","baño exfoliante"]',
  veta            = '["scrub mommy","scrub daddy","importada premium","silicona premium"]'
WHERE item_name = 'Esponja';

-- ─── HIGIENE PERSONAL ───────────────────────────────────────────────────────

UPDATE list_templates SET
  incluye         = '[]',
  requiere_alguno = '["jabon de tocador","jabón de tocador","jabon de glicerina","pastilla","barra de tocador"]',
  excluye         = '["ropa","vajilla","liquido para manos premium"]',
  veta            = '["premium importado","artesanal gourmet"]'
WHERE item_name = 'Jabón de tocador';

UPDATE list_templates SET
  incluye         = '["shampoo"]',
  requiere_alguno = '["cabello","normal","graso","seco","anticaspa","familiar","clasico","clásico"]',
  excluye         = '["perro","mascota","bebe","bebé","seco en aerosol premium","profesional salon"]',
  veta            = '["profesional premium","salon premium","organico","orgánico"]'
WHERE item_name = 'Shampoo';

UPDATE list_templates SET
  incluye         = '["acondicionador"]',
  requiere_alguno = '["cabello","normal","familiar","clasico","clásico","reparacion","reparación"]',
  excluye         = '["perro","mascota","bebe","bebé","profesional salon"]',
  veta            = '["profesional premium","salon premium","organico","orgánico"]'
WHERE item_name = 'Acondicionador';

UPDATE list_templates SET
  incluye         = '["papel higienico"]',
  requiere_alguno = '["doble hoja","simple","pack","rollos","x 4","x 12"]',
  excluye         = '["cocina","rollo de cocina","tisú facial","humedo premium"]',
  veta            = '["premium importado"]'
WHERE item_name = 'Papel higiénico';

UPDATE list_templates SET
  incluye         = '[]',
  requiere_alguno = '["pasta dental","crema dental","dentifrico","dentífrico"]',
  excluye         = '["cepillo","enjuague","hilo"]',
  veta            = '["sensodyne","sensibilidad premium","blanqueadora premium","profesional"]'
WHERE item_name = 'Pasta dental';

UPDATE list_templates SET
  incluye         = '["cepillo"]',
  requiere_alguno = '["dental","dientes"]',
  excluye         = '["electrico premium","eléctrico premium","interdental","reemplazo cabezal"]',
  veta            = '["sensodyne","electrico premium","eléctrico premium","profesional"]'
WHERE item_name = 'Cepillo dental';

UPDATE list_templates SET
  incluye         = '["desodorante"]',
  requiere_alguno = '["antitranspirante","aerosol","roll","crema","barra","corporal"]',
  excluye         = '["ambiente","pies premium","perro","mascota"]',
  veta            = '["premium importado","clinical premium"]'
WHERE item_name = 'Desodorante';
