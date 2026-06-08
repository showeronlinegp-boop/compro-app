'use strict';

const { Router } = require('express');
const db = require('../db');
const { TAXONOMY, getVtexStrings } = require('../categories');
const router = Router();

router.get('/', (req, res) => {
  const {
    q, super: sup, category,
    discount, available,
    page = '1', limit: lim = '48',
  } = req.query;

  const pageNum  = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, parseInt(lim) || 48);
  const offset   = (pageNum - 1) * limitNum;

  const conds  = ['1=1'];
  const params = [];

  if (q)   { conds.push('name LIKE ?'); params.push(`%${q}%`); }
  if (sup) { conds.push('super = ?');  params.push(sup); }
  if (category) {
    const vtex = getVtexStrings(category);
    if (vtex.length) {
      conds.push(`(${vtex.map(() => 'categories LIKE ?').join(' OR ')})`);
      vtex.forEach(s => params.push(`%${s}%`));
    }
  }
  if (discount === '1')  conds.push('discount_pct > 0');
  if (available === '1') conds.push('available = 1');

  const where = conds.join(' AND ');

  // LIMIT/OFFSET son integers validados — los incrustamos directo en el SQL
  // para evitar bugs de node-sqlite3-wasm con parámetros en LIMIT/OFFSET
  // node-sqlite3-wasm requiere array para múltiples parámetros (no spread)
  const countRow = db.prepare(`SELECT COUNT(*) as total FROM products WHERE ${where}`).get(params);

  const total = Number(countRow.total);

  const listSql = `SELECT * FROM products WHERE ${where} ORDER BY discount_pct DESC, name ASC LIMIT ${limitNum} OFFSET ${offset}`;
  const rows = db.prepare(listSql).all(params);

  res.json({
    data: rows.map(parseRow),
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum),
  });
});

// Productos agrupados por barcode — devuelve solo grupos con 2+ supers distintos
router.get('/groups', (req, res) => {
  const { q, category, discount } = req.query;
  const page     = Math.max(1, parseInt(req.query.page) || 1);
  const limitNum = Math.min(100, parseInt(req.query.limit) || 24);
  const offset   = (page - 1) * limitNum;

  // Subconsulta: barcodes que aparecen en 2+ supers distintos
  const conds  = ["barcode IS NOT NULL AND barcode != ''", 'available = 1'];
  const params = [];

  if (q) { conds.push('name LIKE ?'); params.push(`%${q}%`); }
  if (category) {
    const vtex = getVtexStrings(category);
    if (vtex.length) {
      conds.push(`(${vtex.map(() => 'categories LIKE ?').join(' OR ')})`);
      vtex.forEach(s => params.push(`%${s}%`));
    }
  }
  if (discount === '1') conds.push('discount_pct > 0');

  const where = conds.join(' AND ');

  // Barcodes elegibles (con 2+ supers), ordenados por nombre del producto más barato
  const groupsSql = `
    SELECT barcode, MIN(name) as name, MIN(image_url) as image_url, COUNT(DISTINCT super) as super_count
    FROM products
    WHERE ${where}
    GROUP BY barcode
    HAVING COUNT(DISTINCT super) > 1
    ORDER BY name ASC
  `;

  const allGroups = db.prepare(groupsSql).all(params);
  const total = allGroups.length;
  const pageGroups = allGroups.slice(offset, offset + limitNum);

  if (!pageGroups.length) {
    return res.json({ data: [], total: 0, page, pages: 0 });
  }

  // Traer todas las filas de esos barcodes en una sola query
  const barcodes = pageGroups.map(g => g.barcode);
  const placeholders = barcodes.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT * FROM products WHERE barcode IN (${placeholders}) AND available = 1 ORDER BY barcode, raw_price ASC`
  ).all(barcodes);

  // Agrupar filas por barcode
  const byBarcode = new Map();
  for (const row of rows) {
    if (!byBarcode.has(row.barcode)) byBarcode.set(row.barcode, []);
    byBarcode.get(row.barcode).push(parseRow(row));
  }

  const data = pageGroups.map(g => ({
    barcode:      g.barcode,
    name:         byBarcode.get(g.barcode)?.[0]?.name ?? g.name,
    image_url:    byBarcode.get(g.barcode)?.[0]?.image_url ?? g.image_url,
    super_count:  g.super_count,
    variants:     byBarcode.get(g.barcode) ?? [],
  }));

  res.json({ data, total, page, pages: Math.ceil(total / limitNum) });
});

router.get('/categories', (_req, res) => {
  res.json(TAXONOMY.map(({ slug, label, icon }) => ({ slug, label, icon })));
});

function parseRow(p) {
  return { ...p, categories: tryParse(p.categories), available: !!p.available };
}
function tryParse(v) { try { return JSON.parse(v); } catch { return []; } }

module.exports = router;
