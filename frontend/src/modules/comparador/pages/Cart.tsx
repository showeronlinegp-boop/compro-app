import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { EmptyState } from '../../../host/ui/EmptyState';
import { PromoNudge } from '../components/compare';
import { CompareView } from '../components/compare/CompareView';
import { PageContainer } from '../../../host/ui/layout/PageContainer';
import { useCart } from '../contexts/CartContext';
import type { HandoffItem, HandoffResult } from '../handoff';
import { buildHandoffUrl } from '../handoff';
import { FOCUS_RING, PRIMARY_CTA } from '../../../host/ui/styles';
import { superCfg } from '../supers';
import type { CompareResult } from '../types/api';

export default function Cart() {
  const { items, itemCount, clear, updateQty, openCart } = useCart();

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
        // Skip out-of-stock matches: never load an item into a super's cart when
        // that super has no stock for it (sku_id null → excluded, counted partial).
        const m = item.matches.find((x) => x.super === s.super && x.available !== false);
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
      const m = item.matches.find((x) => x.super === b.best_super && x.available !== false);
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

  // Load comparison on mount and whenever the cart snapshot changes.
  // Guard: skip if already loaded for this exact snapshot.
  // sig is empty-string when items is empty, so the items.length guard is implicit.
  useEffect(() => {
    if (!sig) return;
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
  }, [sig]);

  // ─── Empty cart ─────────────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <PageContainer>
        <EmptyState
          icon="🛒"
          title="Tu carrito está vacío"
          description='Agregá productos desde Explorar o Intereses con el botón "+ Carrito"'
          action={
            <Link to="/" className={`${PRIMARY_CTA} ${FOCUS_RING}`}>
              Ir a Explorar
            </Link>
          }
        />
      </PageContainer>
    );
  }

  // ─── Header copy ─────────────────────────────────────────────────────────────
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
    <PageContainer>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-bold text-gray-900">Comparar carrito ({headerCopy})</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openCart}
            className={`text-xs font-medium px-3 py-1.5 rounded-xl border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 transition-colors ${FOCUS_RING}`}
          >
            Editar carrito
          </button>
          <button
            type="button"
            onClick={() => {
              clear().catch(console.error);
            }}
            className={`text-xs font-medium px-3 py-1.5 rounded-xl border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-colors ${FOCUS_RING}`}
          >
            Limpiar carrito
          </button>
        </div>
      </div>

      {/* Compare view */}
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
            <EmptyState
              icon="🔍"
              title="Sin resultados para comparar"
              description="No encontramos precios en otros supers para los productos de tu carrito"
            />
          ) : (
            <CompareView
              result={compareResult}
              priceMode="line"
              layout="stacked"
              topSlot={opportunitiesSection}
              noticeSlot={
                crossSuperMatchedCount < items.length ? (
                  <p className="text-xs text-gray-500 text-center">
                    Comparamos {crossSuperMatchedCount} de {items.length} productos
                  </p>
                ) : null
              }
              renderOptionAAction={(superKey) => {
                const handoff = optionAHandoffs.get(superKey);
                const cfg = superCfg(superKey);
                return (
                  <div className="space-y-1">
                    {handoff?.url ? (
                      <a
                        href={handoff.url}
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
                    {handoff && handoff.included < handoff.total && (
                      <p className="text-xs text-gray-500">
                        {handoff.included} de {handoff.total} productos
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
              optionBFooter={
                compareResult.option_b.by_super.length > 0 ? (
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
                          {superHandoff && superHandoff.included < superHandoff.total && (
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
                ) : null
              }
            />
          ))}
      </div>
    </PageContainer>
  );
}
