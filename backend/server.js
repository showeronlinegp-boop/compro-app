'use strict';

const express = require('express');
const cors    = require('cors');
const cron    = require('node-cron');
const path    = require('path');

const { syncAll, syncSuper, getSyncStatus, isRunning } = require('./crawler-service');
const enricher = require('./enricher');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// API routes
app.use('/api/products',  require('./routes/products'));
app.use('/api/interests', require('./routes/interests'));
app.use('/api/shopping',  require('./routes/shopping'));

// Sync
app.get('/api/sync/status', (_req, res) => {
  res.json(getSyncStatus());
});

app.post('/api/sync/:super', async (req, res) => {
  const key = req.params.super;
  if (isRunning(key)) return res.status(409).json({ error: 'Sync ya en curso' });

  // Responde de inmediato y corre en background
  res.json({ ok: true, message: `Sync de ${key} iniciado` });
  syncSuper(key).catch(err => console.error(`Sync ${key} falló:`, err.message));
});

// Enriquecimiento de precios via JSON-LD
app.get('/api/enrich/status', (_req, res) => {
  res.json(enricher.getStatus());
});

app.post('/api/enrich/:super', (req, res) => {
  const key = req.params.super;
  if (enricher.isRunning(key)) return res.status(409).json({ error: 'Enrichment ya en curso' });
  res.json({ ok: true, message: `Enriquecimiento de ${key} iniciado` });
  enricher.enrichSuper(key).catch(err => console.error(`Enrich ${key} falló:`, err.message));
});

app.post('/api/enrich', (req, res) => {
  const keys = Object.keys(require('./db').prepare('SELECT DISTINCT super FROM products').all().reduce((a, r) => ({ ...a, [r.super]: 1 }), {}));
  res.json({ ok: true, message: `Enriquecimiento de todos los súpers iniciado`, supers: keys });
  for (const key of keys) {
    if (!enricher.isRunning(key)) {
      enricher.enrichSuper(key).catch(err => console.error(`Enrich ${key} falló:`, err.message));
    }
  }
});

// Sirve el frontend compilado en producción
const DIST = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(DIST));
app.get('*', (_req, res) => res.sendFile(path.join(DIST, 'index.html')));

// Cron: sync diario a las 3 AM
cron.schedule('0 3 * * *', () => {
  console.log('[cron] Sync diario arrancando…');
  syncAll().then(r => console.log('[cron] Sync completo:', r));
});

app.listen(PORT, () => {
  console.log(`COMPRO backend corriendo en http://localhost:${PORT}`);
});
