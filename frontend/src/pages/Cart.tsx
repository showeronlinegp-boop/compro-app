import { useEffect, useState } from 'react';
import { api } from '../api';
import { ItemMatchTable, OptionATable, OptionBBreakdown } from '../components/compare';
import { useCart } from '../contexts/CartContext';
import { pesos } from '../supers';
import type { CompareResult } from '../types/api';

export default function Cart() {
  const { items, itemCount, clear, updateQty, removeItem } = useCart();

  // ─── Tab state ──────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<'edit' | 'compare'>('edit');

  // ─── Compare state ──────────────────────────────────────────────────────────
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState('');
  const [loadedSig, setLoadedSig] = useState<string | null>(null);

  // Stale signature: one entry per cart item, cart_item_id:quantity
  const sig = items.map((i) => `${i.cart_item_id}:${i.quantity}`).join(',');

  // Lazy-fetch compare on Comparar activation; refetch when sig changed
  useEffect(() => {
    if (tab !== 'compare') return;
    if (compareResult !== null && loadedSig === sig) return;

    setCompareLoading(true);
    setCompareError('');
    api.cart
      .compare()
      .then((res) => {
        setCompareResult(res);
        setLoadedSig(sig);
      })
      .catch((e) => {
        console.error(e);
        setCompareError('No se pudo cargar la comparación.');
      })
      .finally(() => setCompareLoading(false));
  }, [tab, sig, compareResult, loadedSig]);

  // ─── Empty cart ─────────────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center text-gray-400">
        <p className="text-5xl mb-4">🛒</p>
        <p className="font-medium text-lg">Tu carrito está vacío</p>
        <p className="text-sm mt-2">
          Agregá productos desde Explorar o Intereses con el botón &quot;+ Carrito&quot;
        </p>
      </div>
    );
  }

  // ─── Header copy (WU-6) ─────────────────────────────────────────────────────
  // N = distinct products, M = total units
  const headerCopy =
    itemCount === items.length
      ? `${items.length} productos`
      : `${items.length} productos · ${itemCount} unidades`;

  // ─── Compare transparency line ───────────────────────────────────────────────
  const matched = compareResult
    ? compareResult.items.filter((i) => i.matches.some((m) => m.super !== i.home_super)).length
    : 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-bold text-gray-900">Carrito ({headerCopy})</h1>
        <button
          type="button"
          onClick={() => {
            clear().catch(console.error);
          }}
          className="text-xs font-medium px-3 py-1.5 rounded-xl border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
        >
          Limpiar carrito
        </button>
      </div>

      {/* Pill toggle — Editar / Comparar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl mb-6 w-fit">
        {[
          { id: 'edit' as const, label: 'Editar' },
          { id: 'compare' as const, label: 'Comparar' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`text-sm font-semibold px-4 py-2 rounded-xl transition-colors ${
              tab === t.id
                ? 'bg-white shadow-sm text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── Editar tab ─────────────────────────────────────────────────────── */}
      {tab === 'edit' && (
        <div className="flex flex-col gap-3">
          {items.map((item) => {
            const refPrice = item.offer_price ?? item.raw_price;

            return (
              <div
                key={item.cart_item_id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3 p-3 hover:shadow-md transition-shadow"
              >
                {/* Image */}
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="w-16 h-16 object-contain rounded-xl bg-gray-50 shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-gray-100 shrink-0" />
                )}

                {/* Name + reference price */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 leading-snug line-clamp-2">
                    {item.name}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    <span className="font-semibold text-gray-600">{pesos(refPrice)}</span>{' '}
                    <span className="italic">precio de referencia</span>
                  </p>
                </div>

                {/* Qty stepper */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    aria-label="Reducir cantidad"
                    onClick={() => {
                      if (item.quantity === 1) {
                        removeItem(item.cart_item_id).catch(console.error);
                      } else {
                        updateQty(item.cart_item_id, item.quantity - 1).catch(console.error);
                      }
                    }}
                    className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 font-bold text-sm flex items-center justify-center hover:bg-gray-200 transition-colors"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm font-semibold text-gray-800">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    aria-label="Aumentar cantidad"
                    onClick={() => {
                      updateQty(item.cart_item_id, item.quantity + 1).catch(console.error);
                    }}
                    className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 font-bold text-sm flex items-center justify-center hover:bg-gray-200 transition-colors"
                  >
                    +
                  </button>
                </div>

                {/* Remove */}
                <button
                  type="button"
                  aria-label="Eliminar del carrito"
                  onClick={() => {
                    removeItem(item.cart_item_id).catch(console.error);
                  }}
                  className="w-7 h-7 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors shrink-0"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Comparar tab ───────────────────────────────────────────────────── */}
      {tab === 'compare' && (
        <div>
          {compareLoading && (
            <p className="text-sm text-gray-400 text-center py-8">Calculando comparación…</p>
          )}

          {!compareLoading && compareError && (
            <p className="text-sm text-red-400 text-center py-8">{compareError}</p>
          )}

          {!compareLoading &&
            !compareError &&
            compareResult !== null &&
            (compareResult.items.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-4xl mb-3">🔍</p>
                <p className="font-medium">Sin resultados para comparar</p>
                <p className="text-sm mt-1">
                  No encontramos precios en otros supers para los productos de tu carrito
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Transparency line */}
                {matched < items.length && (
                  <p className="text-xs text-gray-500 text-center">
                    Comparamos {matched} de {items.length} productos
                  </p>
                )}

                {/* Opción A */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="font-bold text-gray-900">Opción A — Todo en un super</h2>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Comprás todo en el super más barato para tu carrito
                      </p>
                    </div>
                    {compareResult.option_a[0] && (
                      <div className="text-right">
                        <p className="text-2xl font-bold text-gray-900">
                          {pesos(compareResult.option_a[0].total)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {compareResult.option_a[0].coverage}% de ítems
                        </p>
                      </div>
                    )}
                  </div>
                  <OptionATable summaries={compareResult.option_a} />
                </div>

                {/* Opción B */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="font-bold text-gray-900">Opción B — El más barato por ítem</h2>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Dividís la compra y llevás cada producto del super que lo tiene más barato
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-900">
                        {pesos(compareResult.option_b.total)}
                      </p>
                      {compareResult.option_b.savings_vs_option_a > 0 && (
                        <p className="text-xs text-green-600 font-semibold">
                          Ahorrás {pesos(compareResult.option_b.savings_vs_option_a)} vs Opción A
                        </p>
                      )}
                    </div>
                  </div>
                  <OptionBBreakdown result={compareResult.option_b} items={compareResult.items} />
                </div>

                {/* Tabla detalle con precios por línea */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <h2 className="font-bold text-gray-900 mb-4">Precios por producto y super</h2>
                  <ItemMatchTable items={compareResult.items} priceMode="line" />
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
