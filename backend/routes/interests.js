'use strict';

const { Router } = require('express');
const db = require('../db');
const router = Router();

router.get('/', (_req, res) => {
  const rows = db.prepare(`
    SELECT i.id as interest_id, i.added_at, p.*
    FROM interests i
    JOIN products p ON i.product_id = p.id
    ORDER BY i.added_at DESC
  `).all();
  res.json(rows.map(parseRow));
});

router.post('/', (req, res) => {
  const { product_id } = req.body;
  if (!product_id) return res.status(400).json({ error: 'product_id requerido' });

  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(product_id);
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

  const existing = db.prepare('SELECT id FROM interests WHERE product_id = ?').get(product_id);
  if (existing) return res.json({ id: existing.id, product_id, already: true });

  const { lastInsertRowid } = db.prepare(
    'INSERT INTO interests (product_id) VALUES (?)'
  ).run(product_id);

  res.status(201).json({ id: lastInsertRowid, product_id });
});

router.delete('/:id', (req, res) => {
  const { changes } = db.prepare('DELETE FROM interests WHERE id = ?').run(req.params.id);
  if (!changes) return res.status(404).json({ error: 'No encontrado' });
  res.json({ ok: true });
});

function parseRow(p) {
  const { interest_id, added_at, ...rest } = p;
  return { interest_id, added_at, ...rest, categories: tryParse(rest.categories), available: !!rest.available };
}
function tryParse(v) { try { return JSON.parse(v); } catch { return []; } }

module.exports = router;
