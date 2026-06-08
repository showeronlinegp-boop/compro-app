'use strict';

/**
 * test-promotions.js
 * Prueba si podemos obtener descuentos de Vea vía search-promotions.
 * Pasos:
 *   1. Fetch de 1 página de la IS API de Vea → extrae sellerId + itemIds reales
 *   2. POST a /_v/search-promotions con esos datos
 *   3. Imprime resultados
 */

const BASE_URL = 'https://www.vea.com.ar';
const IS_PATH  = '/api/io/_v/api/intelligent-search/product_search/category-1/Almacen';
const PROMO_URL = `${BASE_URL}/_v/search-promotions`;
const BATCH_SIZE = 20;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept': 'application/json',
};

async function getProductSample() {
  const url = `${BASE_URL}${IS_PATH}?query=&page=1&count=${BATCH_SIZE}&hideUnavailableItems=true&simulationBehavior=default`;
  console.log(`\n[1] Fetch IS API: ${url}`);
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`IS API HTTP ${res.status}`);
  const data = await res.json();
  return data.products || [];
}

async function fetchPromotions(seller, skus) {
  console.log(`\n[2] POST search-promotions`);
  console.log(`    seller: ${seller}`);
  console.log(`    skus:   ${skus.slice(0, 5).join(', ')}${skus.length > 5 ? ` ... (+${skus.length - 5} más)` : ''}`);

  const res = await fetch(PROMO_URL, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ seller, skus }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`search-promotions HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function main() {
  const products = await getProductSample();
  if (!products.length) {
    console.error('No se obtuvieron productos de la IS API');
    process.exit(1);
  }

  // Extraer sellerId y itemId del primer producto para diagnóstico
  const first = products[0];
  const firstItem = first.items?.[0] || {};
  const firstSeller = firstItem.sellers?.[0] || {};

  console.log(`\n--- Estructura del primer producto ---`);
  console.log(`  productId:  ${first.productId}`);
  console.log(`  productName: ${first.productName}`);
  console.log(`  itemId:     ${firstItem.itemId}`);
  console.log(`  sellerId:   ${firstSeller.sellerId}`);
  console.log(`  ¿productId == itemId? ${first.productId === firstItem.itemId}`);

  const sellerId = firstSeller.sellerId;
  if (!sellerId) {
    console.error('No se pudo extraer sellerId del primer producto');
    console.log('items[0]:', JSON.stringify(firstItem, null, 2).slice(0, 500));
    process.exit(1);
  }

  // Recolectar todos los itemIds del batch (primer item de cada producto)
  const skus = products
    .map(p => p.items?.[0]?.itemId)
    .filter(Boolean);

  const promoData = await fetchPromotions(sellerId, skus);

  // Parsear resultados
  const genericPromos = promoData?.promotions?.generic?.promotions || {};
  const withPromo = Object.entries(genericPromos);

  console.log(`\n[3] Resultados`);
  console.log(`    SKUs enviados:     ${skus.length}`);
  console.log(`    Con promoción:     ${withPromo.length}`);
  console.log(`    Sin promoción:     ${skus.length - withPromo.length}`);

  if (withPromo.length) {
    console.log('\n--- Promociones encontradas ---');
    for (const [sku, promo] of withPromo) {
      console.log(`  SKU ${sku}: "${promo.name}"`);
      console.log(`    type: ${promo.categoryType} | code: ${promo.code} | effectiveDiscount: ${promo.effectiveDiscount}`);
      console.log(`    vigencia: ${promo.start} → ${promo.end}`);
    }
  } else {
    console.log('\n  (ningún producto de este batch tiene promo activa)');
    console.log('\n  Canales completos (para diagnóstico):');
    for (const channel of Object.keys(promoData?.promotions || {})) {
      const count = Object.keys(promoData.promotions[channel]?.promotions || {}).length;
      console.log(`    ${channel}: ${count} promos`);
    }
  }

  console.log('\n--- Raw response (para referencia) ---');
  console.log(JSON.stringify(promoData, null, 2).slice(0, 1000));
}

main().catch(e => { console.error('Error fatal:', e.message); process.exit(1); });
