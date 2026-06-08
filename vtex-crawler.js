#!/usr/bin/env node
/**
 * vtex-crawler.js — Crawler sobre VTEX Intelligent Search.
 *
 * Ventajas vs. catalog_system:
 *   - hideUnavailableItems=true → solo productos comprables (filtro server-side)
 *   - Paginado limpio por page/count
 *   - Sin fullIdPath ni sc params
 *   - Particionado por category-1 (nombres del árbol de catálogo) para superar
 *     el límite duro de 2500 registros por path que impone la IS API.
 */

'use strict';

const SUPERS = {
  vea:       { baseUrl: 'https://www.vea.com.ar', promoSeller: 'jumboargentinav700cordoba700' },
  masonline: { baseUrl: 'https://www.masonline.com.ar' },
  carrefour: { baseUrl: 'https://www.carrefour.com.ar' },
  dia:       { baseUrl: 'https://diaonline.supermercadosdia.com.ar' },
};

const IS_BASE      = '/api/io/_v/api/intelligent-search';
const PAGE_SIZE    = 50;
const IS_SAFE_MAX  = 2450;   // límite duro de IS API es 2500; dejamos margen
const THROTTLE_MS  = 500;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept': 'application/json',
};

const sleep   = (ms) => new Promise((r) => setTimeout(r, ms));
const num     = (v)  => (v == null || isNaN(Number(v)) ? null : Number(v));
const fmt     = (n)  => (n == null ? '—' : n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' }));
const TIMEOUT_MS = 20_000; // abortar fetch si no responde en 20s

// ============================================================
// IS API: una página de productos comprables para un facetPath
// ============================================================
async function searchPage(cfg, facetPath, page) {
  // Codificar cada segmento del path por separado para preservar la estructura
  const encodedPath = facetPath.split('/').map(encodeURIComponent).join('/');
  const url =
    `${cfg.baseUrl}${IS_BASE}/product_search/${encodedPath}` +
    `?query=&page=${page}&count=${PAGE_SIZE}&hideUnavailableItems=true&simulationBehavior=default`;
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return { products: data.products || [], total: num(data.recordsFiltered) || 0 };
}

// ============================================================
// Particionado: árbol catalog_system (nivel 1-2) + probe IS
// ============================================================
async function getCatalogTree(cfg, depth = 2) {
  const res = await fetch(
    `${cfg.baseUrl}/api/catalog_system/pub/category/tree/${depth}`,
    { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) }
  );
  if (!res.ok) throw new Error(`catalog tree HTTP ${res.status}`);
  return res.json();
}

async function probeCount(cfg, facetPath) {
  try {
    const { total } = await searchPage(cfg, facetPath, 1);
    return total;
  } catch {
    return 0;
  }
}

/**
 * Construye el plan de particiones usando el árbol de catálogo para los
 * nombres de categoría y la IS API para los conteos reales.
 * Si un departamento (cat-1) supera IS_SAFE_MAX, se subdivide por cat-2.
 */
async function getPartitions(cfg) {
  const tree = await getCatalogTree(cfg, 2);
  const partitions = [];

  for (const dept of tree) {
    const path1 = `category-1/${dept.name}`;
    const total1 = await probeCount(cfg, path1);
    await sleep(THROTTLE_MS);

    if (total1 === 0) continue;

    if (total1 <= IS_SAFE_MAX) {
      partitions.push({ path: path1, name: dept.name, total: total1 });
      continue;
    }

    // Departamento muy grande → subdividir por cat-2
    const subs = dept.children || [];
    if (!subs.length) {
      // Sin subcategorías: incluir igual (se truncará en IS_SAFE_MAX)
      partitions.push({ path: path1, name: dept.name, total: total1, truncated: true });
      continue;
    }

    for (const sub of subs) {
      const path2 = `category-1/${dept.name}/category-2/${sub.name}`;
      const total2 = await probeCount(cfg, path2);
      await sleep(THROTTLE_MS);
      if (total2 === 0) continue;
      partitions.push({
        path: path2,
        name: `${dept.name} > ${sub.name}`,
        total: total2,
        truncated: total2 > IS_SAFE_MAX,
      });
    }
  }

  return partitions;
}

// ============================================================
// Normalización IS → esquema interno
// ============================================================
function buildNormalizer(cfg) {
  return function normalize(p) {
    const item   = (p.items && p.items[0])                         || {};
    const seller = (item.sellers && item.sellers[0])               || {};
    const offer  = seller.commertialOffer                          || {};

    // Filtro duro: IS API puede incluir productos con stock 0 a pesar de hideUnavailableItems.
    if (num(offer.AvailableQuantity) === 0) {
      console.log(`  [skip] ${p.productName} — AvailableQuantity=0`);
      return null;
    }

    // PriceWithoutDiscount = precio sin descuento de catálogo (base real).
    // Price = precio de venta actual (puede tener descuento).
    // ListPrice = precio obsoleto pre-inflación: IGNORAR.
    const basePrice  = num(offer.PriceWithoutDiscount) ?? num(offer.Price);
    const salePrice  = num(offer.Price);
    // PriceWithoutDiscount puede tener valores stale de períodos inflacionarios anteriores.
    // Si la diferencia supera el 80%, descartamos el descuento como irreal.
    const rawDiscount = basePrice != null && salePrice != null && salePrice < basePrice
      ? Math.round(((basePrice - salePrice) / basePrice) * 100)
      : 0;
    const hasDiscount = rawDiscount > 0 && rawDiscount <= 80;

    const categoryPaths = (p.categories || [])
      .map((c) => c.replace(/^\/|\/$/g, '').replace(/\//g, ' > '))
      .filter(Boolean);

    return {
      product_id:    String(p.productId),
      sku_id:        item.itemId ? String(item.itemId) : null,
      name:          p.productName,
      barcode:       item.ean || null,
      image_url:     (item.images && item.images[0] && item.images[0].imageUrl) || null,
      product_url:   p.link || `${cfg.baseUrl}/${p.linkText}/p`,
      raw_price:     hasDiscount ? basePrice : salePrice,
      offer_price:   hasDiscount ? salePrice : null,
      discount_pct:  hasDiscount ? rawDiscount : 0,
      available:     true, // garantizado por hideUnavailableItems=true
      category_paths: categoryPaths,
    };
  };
}

// ============================================================
// Crawl de una partición → vuelca al Map `seen` (dedup por productId)
// ============================================================
async function crawlPartition(cfg, partition, seen, normalize) {
  const maxPages = Math.ceil(Math.min(partition.total, IS_SAFE_MAX) / PAGE_SIZE);
  let fetched = 0;
  const touchedIds = new Set();
  console.log(`  → crawl: "${partition.name}" (~${partition.total} prods, ${maxPages} págs)`);

  for (let page = 1; page <= maxPages; page++) {
    let result;
    try {
      result = await searchPage(cfg, partition.path, page);
    } catch (err) {
      console.error(`  ⚠️  ${partition.name} pág ${page}: ${err.message}`);
      break;
    }

    if (!result.products.length) break;

    for (const p of result.products) {
      fetched++;
      // Log del primer producto de cada partición con JSON completo
      if (fetched === 1) {
        console.log(`  [raw-json] ${p.productName}:`);
        console.log(JSON.stringify(p, null, 2));
      }
      const norm = normalize(p);
      if (!norm) continue; // AvailableQuantity === 0
      const existing = seen.get(norm.product_id);
      if (existing) {
        for (const c of norm.category_paths) {
          if (!existing.category_paths.includes(c)) existing.category_paths.push(c);
        }
      } else {
        if (!norm.category_paths.length) norm.category_paths = [partition.name];
        seen.set(norm.product_id, norm);
      }
      touchedIds.add(norm.product_id);
    }

    if (result.products.length < PAGE_SIZE) break;
    await sleep(THROTTLE_MS);
  }

  return { fetched, total: partition.total, touchedIds };
}

// ============================================================
// Runner CLI
// ============================================================
async function main() {
  const args    = process.argv.slice(2);
  const flags   = args.filter((a) => a.startsWith('--'));
  const key     = args.find((a) => !a.startsWith('--')) || 'vea';
  const cfg     = SUPERS[key];
  if (!cfg) {
    console.error(`❌ Súper desconocido: ${key}. Opciones: ${Object.keys(SUPERS).join(', ')}`);
    process.exit(1);
  }

  const onlyPlan = flags.includes('--plan');
  const full     = flags.includes('--full');
  const normalize = buildNormalizer(cfg);

  console.log(`\n🏪  ${key.toUpperCase()}  —  ${cfg.baseUrl}  (Intelligent Search)\n`);

  console.log('🧭 Armando plan de particiones…');
  const partitions = await getPartitions(cfg);
  const totalDisp  = partitions.reduce((a, p) => a + (p.total || 0), 0);
  const flagged    = partitions.filter((p) => p.truncated);

  console.log(`\n📦 ${partitions.length} particiones | ~${totalDisp} productos comprables\n`);
  partitions
    .slice()
    .sort((a, b) => (b.total || 0) - (a.total || 0))
    .forEach((p) => {
      const flag = p.truncated ? '  🚩 >2450 (truncado — pendiente subdivisión extra)' : '';
      console.log(`  ${String(p.total ?? '?').padStart(6)}  ${p.name}${flag}`);
    });
  if (flagged.length) console.log(`\n🚩 ${flagged.length} partición(es) superan el límite.`);

  if (onlyPlan) return;

  const seen = new Map();

  if (full) {
    console.log(`\n⏬ Crawl completo de ${partitions.length} particiones…`);
    let done = 0;
    for (const part of partitions) {
      await crawlPartition(cfg, part, seen, normalize);
      console.log(`  (${++done}/${partitions.length}) ${part.name} → ${seen.size} únicos acumulados`);
      await sleep(THROTTLE_MS);
    }
  } else {
    const target = partitions
      .filter((p) => !p.truncated)
      .sort((a, b) => (b.total || 0) - (a.total || 0))[0] || partitions[0];
    console.log(`\n🔎 Crawl de la partición más grande: "${target.name}" (~${target.total} prod.)\n`);
    await crawlPartition(cfg, target, seen, normalize);
  }

  const products  = [...seen.values()];
  const conDesc   = products.filter((p) => p.discount_pct > 0).length;
  console.log(`\n✅ ${products.length} productos únicos | ${conDesc} con descuento\n`);
  products.slice(0, 6).forEach((p, i) => {
    const desc = p.discount_pct ? ` 🔥 -${p.discount_pct}% → ${fmt(p.offer_price)}` : '';
    console.log(`  ${i + 1}. ${p.name}`);
    console.log(`     ${fmt(p.raw_price)}${desc} | EAN ${p.barcode || '—'}`);
    console.log(`     cat: ${p.category_paths.join('  ·  ')}`);
    console.log(`     ${p.product_url}`);
  });
}

if (require.main === module) {
  main().catch((e) => { console.error('Error fatal:', e); process.exit(1); });
}

module.exports = { SUPERS, getPartitions, crawlPartition, buildNormalizer, searchPage, sleep };
