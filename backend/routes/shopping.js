'use strict';

const { Router } = require('express');
const db = require('../db');
const router = Router();

const WITH_PRODUCT = `
  SELECT s.id as shopping_id, s.frequency_days, s.last_bought, s.notes, s.created_at as shopping_created_at,
         p.*
  FROM shopping s
  JOIN products p ON s.product_id = p.id
`;

router.get('/', (_req, res) => {
  const rows = db.prepare(`${WITH_PRODUCT} ORDER BY p.name`).all();
  res.json(rows.map(parseRow));
});

// Productos que toca comprar esta semana
router.get('/weekly', (_req, res) => {
  const rows = db.prepare(`
    ${WITH_PRODUCT}
    WHERE s.last_bought IS NULL
       OR (julianday('now') - julianday(s.last_bought)) >= s.frequency_days
    ORDER BY p.super, p.name
  `).all();

  const bySuper = {};
  for (const row of rows) {
    const parsed = parseRow(row);
    if (!bySuper[parsed.super]) bySuper[parsed.super] = { super: parsed.super, items: [], total: 0 };
    bySuper[parsed.super].items.push(parsed);
    const price = parsed.offer_price ?? parsed.raw_price ?? 0;
    bySuper[parsed.super].total += price;
  }

  res.json(Object.values(bySuper));
});

router.post('/', (req, res) => {
  const { product_id, frequency_days = 7, notes = '' } = req.body;
  if (!product_id) return res.status(400).json({ error: 'product_id requerido' });

  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(product_id);
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

  const existing = db.prepare('SELECT id FROM shopping WHERE product_id = ?').get(product_id);
  if (existing) return res.json({ id: existing.id, product_id, already: true });

  const { lastInsertRowid } = db.prepare(
    'INSERT INTO shopping (product_id, frequency_days, notes) VALUES (?,?,?)'
  ).run([product_id, frequency_days, notes]);

  res.status(201).json({ id: lastInsertRowid, product_id, frequency_days });
});

router.put('/:id', (req, res) => {
  const { frequency_days, last_bought, notes } = req.body;
  const item = db.prepare('SELECT id FROM shopping WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'No encontrado' });

  const sets = [];
  const params = [];

  if (frequency_days != null) { sets.push('frequency_days = ?'); params.push(frequency_days); }
  if (last_bought !== undefined) { sets.push('last_bought = ?');    params.push(last_bought); }
  if (notes !== undefined)       { sets.push('notes = ?');          params.push(notes); }

  if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });

  db.prepare(`UPDATE shopping SET ${sets.join(', ')} WHERE id = ?`).run([...params, req.params.id]);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const { changes } = db.prepare('DELETE FROM shopping WHERE id = ?').run(req.params.id);
  if (!changes) return res.status(404).json({ error: 'No encontrado' });
  res.json({ ok: true });
});

function parseRow(p) {
  const { shopping_id, frequency_days, last_bought, notes, shopping_created_at, ...rest } = p;
  return {
    shopping_id, frequency_days, last_bought, notes, shopping_created_at,
    ...rest,
    categories: tryParse(rest.categories),
    available: !!rest.available,
  };
}
function tryParse(v) { try { return JSON.parse(v); } catch { return []; } }

module.exports = router;
