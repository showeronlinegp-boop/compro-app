import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { ItemMatchTable, OptionATable, OptionBBreakdown, PromoNudge } from '../components/compare';
import { useCart } from '../contexts/CartContext';
import type { HandoffItem, HandoffResult } from '../handoff';
import { buildHandoffUrl } from '../handoff';
import { pesos, superCfg } from '../supers';
import type { CompareResult } from '../types/api';

export default function Cart() {
  const { items, itemCount, clear, updateQty, removeItem } = useCart();

  // ─── Tab state ──────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<'edit' | 'compare'>('edit');

  // ─── Compare state ──────────────────────────────────────────────────────────
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState('');
  // useRef so mutating it never triggers a re-render / extra effect tick
  const loadedSigRef = useRef<string | null>(null);

  // Stale signature: one entry per cart item, cart_item_id:quantity
  const sig = items.map((i) => `${i.cart_item_id}:${i.quantity}`).join(',');

  // ─── Handoff derivation ─────────────────────────────────────────────────────

  // Qty lookup: CompareItem.shopping_id === cart_item_id (verified identity alignment).
  const qtyByCartItem = useMemo(
    () => new Map(items.map((i) => [i.cart_item_id, i.quantity])),
    [items],
  );

  // Option A: one handoff button PER super in option_a (user picks which super to go to).
  // The cheapest is option_a[0] and stays visually highlighted ("MÁS BARATO" badge).
  // For each super S, ALL cart items are considered:
  //   - item has a match for S → use match sku_id
  //   - no match → sku_id: null (filtered by buildHandoffUrl; reflected in partial count)
  const optionAHandoffs = useMemo<Map<string, HandoffResult>>(() => {
    if (!compareResult) return new Map();
    const result = new Map<string, HandoffResult>();
    for (const s of compareResult.option_a) {
      const handoffItems: HandoffItem[] = compareResult.items.map((item) => {
        const m = item.matches.find((x) => x.super === s.super);
        return { sku_id: m?.sku_id ?? null, qty: qtyByCartItem.get(item.shopping_id) ?? 1 };
      });
      result.set(
        s.super,
        buildHandoffUrl(
          superCfg(s.super).checkoutBaseUrl ?? '',
          handoffItems,
          superCfg(s.super).salesChannel ?? 1,
        ),
      );
    }
    return result;
  }, [compareResult, qtyByCartItem]);

  // Option B: one button per super in option_b.by_super.
  const optionBHandoffs = useMemo<Map<string, HandoffResult>>(() => {
    if (!compareResult) return new Map();
    const itemMap = new Map(compareResult.items.map((i) => [i.shopping_id, i]));
    const bySuper = new Map<string, HandoffItem[]>();
    for (const b of compareResult.option_b.breakdown) {
      const item = itemMap.get(b.shopping_id);
      if (!item) continue;
      const m = item.matches.find((x) => x.super === b.best_super);
      const list = bySuper.get(b.best_super) ?? [];
      list.push({ sku_id: m?.sku_id ?? null, qty: qtyByCartItem.get(b.shopping_id) ?? 1 });
      bySuper.set(b.best_super, list);
    }
    const result = new Map<string, HandoffResult>();
    for (const s of compareResult.option_b.by_super) {
      result.set(
        s.super,
        buildHandoffUrl(
          superCfg(s.super).checkoutBaseUrl ?? '',
          bySuper.get(s.super) ?? [],
          superCfg(s.super).salesChannel ?? 1,
        ),
      );
    }
    return result;
  }, [compareResult, qtyByCartItem]);

  // Guard: skip if already loaded for this cart snapshot (sig).
  // Refetch when the snapshot changed (new sig) or on first Comparar activation.
  useEffect(() => {
    if (tab !== 'compare') return;
    if (loadedSigRef.current === sig) return;

    setCompareLoading(true);
    setCompareError('');
    api.cart
      .compare()
      .then((res) => {
        setCompareResult(res);
        loadedSigRef.current = sig;
      })
      .catch((e) => {
        console.error(e);
        setCompareError('No se pudo cargar la comparación.');
      })
      .finally(() => setCompareLoading(false));
  }, [tab, sig]);

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
  const productWord = items.length === 1 ? 'producto' : 'productos';
  const headerCopy =
    itemCount === items.length
      ? `${items.length} ${productWord}`
      : `${items.length} ${productWord} · ${itemCount} unidades`;

  // ─── Compare transparency line ───────────────────────────────────────────────
  // Only counts items with at least one match from a super other than their home super.
  const crossSuperMatchedCount = compareResult
    ? compareResult.items.filter((i) => i.matches.some((m) => m.super !== i.home_super)).length
    : 0;

  // ─── Oportunidades section ───────────────────────────────────────────────────
  // projected total savings = (unit saving) × target_qty, sort desc
  function savings(o: {
    current_best_unit_price: number;
    effective_unit_price_at_target: number;
    target_qty: number;
  }) {
    return (o.current_best_unit_price - o.effective_unit_price_at_target) * o.target_qty;
  }

  const opportunitiesSection = (() => {
    if (!compareResult) return null;
    const opps = compareResult.items.flatMap((item) =>
      item.opportunity != null ? [{ opportunity: item.opportunity, name: item.name }] : [],
    );
    opps.sort((a, b) => savings(b.opportunity) - savings(a.opportunity));
    if (opps.length === 0) return null;
    return (
      <div
        data-testid="opportunities-section"
        className="bg-white rounded-2xl border border-amber-300 shadow-sm p-5"
      >
        <h2 className="flex items-center gap-2 font-bold text-gray-900">
          <span aria-hidden="true">💡</span> Oportunidades de ahorro
        </h2>
        <p className="text-xs text-gray-500 mt-0.5 mb-4">
          Pequeños ajustes que activan promos y bajan el precio por unidad
        </p>
        <div className="space-y-3">
          {opps.map((opp) => (
            <PromoNudge
              key={opp.opportunity.shopping_id}
              opportunity={opp.opportunity}
              name={opp.name}
              onAgregar={async (shoppingId, targetQty) => {
                await updateQty(shoppingId, targetQty);
              }}
            />
          ))}
        </div>
      </div>
    );
  })();

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
                {/* Oportunidades — hero callout, surfaced first as the most actionable saving */}
                {opportunitiesSection}

                {/* Transparency line */}
                {crossSuperMatchedCount < items.length && (
                  <p className="text-xs text-gray-500 text-center">
                    Comparamos {crossSuperMatchedCount} de {items.length} productos
                  </p>
                )}

                {/* Opción A */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="font-bold text-gray-900">Opción A — Todo en un super</h2>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Comprás todo en un solo super — elegí cuál
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
                  <OptionATable
                    summaries={compareResult.option_a}
                    renderAction={(superKey) => {
                      const result = optionAHandoffs.get(superKey);
                      const cfg = superCfg(superKey);
                      return (
                        <div className="space-y-1">
                          {result?.url ? (
                            <a
                              href={result.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              data-testid={`handoff-option-a-${superKey}`}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
                            >
                              Armar carrito en {cfg.label}
                            </a>
                          ) : (
                            <span
                              data-testid={`handoff-option-a-${superKey}`}
                              aria-disabled="true"
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-200 text-gray-400 text-sm font-semibold cursor-not-allowed"
                            >
                              Armar carrito en {cfg.label}
                            </span>
                          )}
                          {result && result.included < result.total && (
                            <p className="text-xs text-gray-500">
                              {result.included} de {result.total} productos
                            </p>
                          )}
                          {superKey === 'vea' && (
                            <p className="text-xs text-amber-600">
                              ⚠ VEA puede pedirte elegir tu sucursal antes de confirmar
                            </p>
                          )}
                        </div>
                      );
                    }}
                  />
                  {/* Explainer + disclaimer once below the table, not repeated per button */}
                  {compareResult.option_a.length > 0 && (
                    <div className="mt-3 space-y-0.5">
                      <p className="text-xs text-gray-500">
                        Te abrimos la tienda del super con tu carrito cargado. Completás la compra ahí.
                      </p>
                      <p className="text-xs text-gray-500">
                        Los precios pueden variar al momento de pagar.
                      </p>
                    </div>
                  )}
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

                  {/* Option B handoff buttons — one per super in by_super */}
                  {compareResult.option_b.by_super.length > 0 && (
                    <div className="mt-4 space-y-3">
                      {/* Explainer: how many supers the split covers */}
                      {(() => {
                        const n = compareResult.option_b.by_super.length;
                        return (
                          <p className="text-xs text-gray-500">
                            {n === 1
                              ? 'Tu compra es en 1 super. Te armamos el carrito con los productos que convienen ahí — completás la compra ahí.'
                              : `Tu compra se divide en ${n} supers. Te armamos el carrito en cada uno con los productos que convienen ahí — completás cada compra por separado.`}
                          </p>
                        );
                      })()}
                      {compareResult.option_b.by_super.map((s) => {
                        const superHandoff = optionBHandoffs.get(s.super);
                        return (
                          <div key={s.super} className="space-y-1">
                            {superHandoff?.url ? (
                              <a
                                href={superHandoff.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                data-testid={`handoff-option-b-${s.super}`}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
                              >
                                Armar carrito en {superCfg(s.super).label}
                              </a>
                            ) : (
                              <span
                                aria-disabled="true"
                                data-testid={`handoff-option-b-${s.super}`}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-200 text-gray-400 text-sm font-semibold cursor-not-allowed"
                              >
                                Armar carrito en {superCfg(s.super).label}
                              </span>
                            )}
                            {superHandoff &&
                              superHandoff.included < superHandoff.total && (
                                <p className="text-xs text-gray-500">
                                  {superHandoff.included} de {superHandoff.total} productos
                                </p>
                              )}
                            <p className="text-xs text-gray-500">
                              Los precios pueden variar al momento de pagar.
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
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
