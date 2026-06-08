'use strict';

const TAXONOMY = [
  {
    slug: 'lacteos',
    label: 'Lácteos y frescos',
    icon: '🥛',
    vtex: ['Lácteos', 'Lácteos y productos frescos', 'Frescos', 'Huevos', 'Pastas Frescas'],
  },
  {
    slug: 'carnes',
    label: 'Carnes y pescados',
    icon: '🥩',
    vtex: ['Carnes', 'Carnes y pescados', 'Carnicería', 'Pescaderia', 'Pescados y Mariscos', 'Rotiseria'],
  },
  {
    slug: 'frutas-verduras',
    label: 'Frutas y verduras',
    icon: '🥦',
    vtex: ['Frutas', 'Verduras', 'Frutas y Verduras', 'Frutas y verduras'],
  },
  {
    slug: 'panaderia',
    label: 'Panadería',
    icon: '🥖',
    vtex: ['Panaderia', 'Panaderia y Pasteleria', 'Panadería', 'Panificados'],
  },
  {
    slug: 'almacen',
    label: 'Almacén',
    icon: '🛒',
    vtex: [
      'Almacén', 'Aceites, Vinagres Y Aderezos', 'Arroz, Legumbres Y Pastas',
      'Caldos, Sopas Y Pure', 'Condimentos Y Especias', 'Conservas Y Enlatados',
      'Harinas', 'Pastas Y Tapas', 'Reposteria',
    ],
  },
  {
    slug: 'congelados',
    label: 'Congelados',
    icon: '🧊',
    vtex: ['Congelados'],
  },
  {
    slug: 'fiambres',
    label: 'Fiambres y quesos',
    icon: '🧀',
    vtex: ['Fiambres Y Embutidos', 'Quesos', 'Quesos y Fiambres'],
  },
  {
    slug: 'bebidas',
    label: 'Bebidas sin alcohol',
    icon: '🥤',
    vtex: ['Bebidas', 'Aguas', 'Gaseosas', 'Jugos', 'Bebidas Isotonicas Y Energizantes', 'A Base De Hierbas'],
  },
  {
    slug: 'alcohol',
    label: 'Bebidas con alcohol',
    icon: '🍷',
    vtex: ['Cervezas', 'Vinos Y Espumantes', 'Bebidas Blancas, Licores Y Whiskys', 'Fernet Y Aperitivos'],
  },
  {
    slug: 'desayuno',
    label: 'Desayuno y merienda',
    icon: '☕',
    vtex: ['Desayuno', 'Desayuno y merienda', 'Desayunos Y Meriendas', 'Kiosco', 'Snacks'],
  },
  {
    slug: 'limpieza',
    label: 'Limpieza',
    icon: '🧹',
    vtex: [
      'Limpieza', 'Limpieza del Hogar', 'Limpieza de Baño', 'Limpieza De Baño',
      'Lavandinas', 'Lavado de la Ropa', 'Insecticidas',
      'Desodorante De Ambientes', 'Papeles, Bolsas Y Films', 'Accesorios De Limpieza',
    ],
  },
  {
    slug: 'personal',
    label: 'Cuidado personal',
    icon: '🧴',
    vtex: [
      'Cuidado Personal', 'Cuidado Del Cabello', 'Cuidado De La Piel', 'Cuidado Oral',
      'Perfumería', 'Dermocosmetica', 'Maquillaje', 'Fragancias',
      'Protección Femenina', 'Hombres', 'Mujer', 'Electro Belleza',
    ],
  },
  {
    slug: 'farmacia',
    label: 'Farmacia',
    icon: '💊',
    vtex: ['Farmacia', 'Perfumería y farmacia', 'Nutricion', 'Cuidado Del Adulto'],
  },
  {
    slug: 'bebes',
    label: 'Bebés y niños',
    icon: '👶',
    vtex: [
      'Bebés', 'Bebés y Niños', 'Mundo Bebe', 'Mundo Bebé',
      'Lactancia Y Alimentación', 'Pañales e Higiene', 'Cuidado De La Mamá', 'Niños',
    ],
  },
  {
    slug: 'mascotas',
    label: 'Mascotas',
    icon: '🐾',
    vtex: ['Mascotas', 'Perros', 'Gatos'],
  },
  {
    slug: 'hogar',
    label: 'Hogar y electro',
    icon: '🏠',
    vtex: [
      'Hogar', 'Hogar y Deco', 'Hogar y textil', 'Bazar y Cocina',
      'Electro', 'Electro Hogar', 'Electro y tecnología',
      'Pequeños electrodomésticos', 'Organización', 'Decoración',
    ],
  },
];

// Lookup rápido slug → array de strings VTEX
const BY_SLUG = Object.fromEntries(TAXONOMY.map(c => [c.slug, c.vtex]));

function getVtexStrings(slug) {
  return BY_SLUG[slug] || [];
}

module.exports = { TAXONOMY, getVtexStrings };
