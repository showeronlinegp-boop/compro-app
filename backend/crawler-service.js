'use strict';

const { SUPERS, getPartitions, crawlPartition, buildNormalizer, sleep } = require('../vtex-crawler');
const db       = require('./db');
const enricher = require('./enricher');

const running = new Set();

const upsertStmt = () => db.prepare(`
  INSERT INTO products
    (super, product_id, sku_id, name, barcode, image_url, product_url,
     raw_price, offer_price, discount_pct, available, categories, synced_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
  ON CONFLICT(super, product_id) DO UPDATE SET
    sku_id      = excluded.sku_id,
    name        = excluded.name,
    raw_price   = excluded.raw_price,
    offer_price = excluded.offer_price,
    discount_pct= excluded.discount_pct,
    available   = excluded.available,
    categories  = excluded.categories,
    synced_at   = excluded.synced_at
`);

function flushToDb(superKey, seen, touchedIds) {
  const upsert = upsertStmt();
  const prods = touchedIds
    ? [...touchedIds].map(id => seen.get(id)).filter(Boolean)
    : [...seen.values()];
  const flush = db.transaction((prods) => {
    for (const p of prods) {
      // node-sqlite3-wasm requiere array para múltiples parámetros (no spread)
      upsert.run([
        superKey, p.product_id, p.sku_id || null, p.name, p.barcode, p.image_url, p.product_url,
        p.raw_price, p.offer_price, p.discount_pct, p.available ? 1 : 0,
        JSON.stringify(p.category_paths),
      ]);
    }
  });
  flush(prods);
}

async function syncSuper(superKey) {
  if (running.has(superKey)) throw new Error(`Sync de ${superKey} ya en curso`);
  const cfg = SUPERS[superKey];
  if (!cfg) throw new Error(`Súper desconocido: ${superKey}`);

  running.add(superKey);

  const { lastInsertRowid: logId } = db.prepare(`
    INSERT INTO sync_log (super, started_at, status, progress_leaf, total_leaves)
    VALUES (?, datetime('now'), 'running', 0, 0)
  `).run(superKey);

  const updateProgress = db.prepare(
    `UPDATE sync_log SET progress_leaf=?, total_leaves=?, product_count=? WHERE id=?`
  );

  try {
    console.log(`[sync:${superKey}] Armando plan de particiones (IS API)...`);
    const partitions = await getPartitions(cfg);
    console.log(`[sync:${superKey}] ${partitions.length} particiones`);
    updateProgress.run([0, partitions.length, 0, logId]);

    const normalize = buildNormalizer(cfg);
    const seen = new Map();

    for (let i = 0; i < partitions.length; i++) {
      const { touchedIds } = await crawlPartition(cfg, partitions[i], seen, normalize);

      flushToDb(superKey, seen, touchedIds);
      updateProgress.run([i + 1, partitions.length, seen.size, logId]);
      console.log(`[sync:${superKey}] ${i + 1}/${partitions.length} particiones — ${seen.size} productos guardados`);

      await sleep(500);
    }

    // Eliminar filas de syncs anteriores que el IS no encontró (evita datos stale del catalog API)
    const { changes } = db.prepare(
      `DELETE FROM products WHERE super = ? AND synced_at < (SELECT started_at FROM sync_log WHERE id = ?)`
    ).run([superKey, logId]);
    if (changes > 0) console.log(`[sync:${superKey}] Eliminados ${changes} productos stale del sync anterior`);

    db.prepare(`
      UPDATE sync_log
      SET finished_at=datetime('now'), product_count=?, status='ok', progress_leaf=total_leaves
      WHERE id=?
    `).run([seen.size, logId]);

    console.log(`[sync:${superKey}] Listo. ${seen.size} productos.`);

    // Auto-enriquecimiento: correr en background, sin bloquear la respuesta del sync
    enricher.enrichSuper(superKey)
      .catch(err => console.error(`[enrich:${superKey}] Error:`, err.message));

    return { super: superKey, count: seen.size };

  } catch (err) {
    db.prepare(`
      UPDATE sync_log SET finished_at=datetime('now'), status='error', error=? WHERE id=?
    `).run([err.message, logId]);
    console.error(`[sync:${superKey}] Error:`, err.message);
    throw err;
  } finally {
    running.delete(superKey);
  }
}

async function syncAll() {
  const results = [];
  for (const key of Object.keys(SUPERS)) {
    try {
      results.push(await syncSuper(key));
    } catch (err) {
      results.push({ super: key, error: err.message });
    }
  }
  return results;
}

function getSyncStatus() {
  return db.prepare(`
    SELECT super, started_at, finished_at, product_count, status, error,
           progress_leaf, total_leaves
    FROM sync_log
    WHERE id IN (SELECT MAX(id) FROM sync_log GROUP BY super)
    ORDER BY super
  `).all();
}

function isRunning(superKey) {
  return running.has(superKey);
}

module.exports = { syncSuper, syncAll, getSyncStatus, isRunning };
