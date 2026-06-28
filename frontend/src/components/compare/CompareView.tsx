import type { ReactNode } from 'react';
import { pesos } from '../../supers';
import type { CompareResult, SuperKey } from '../../types/api';
import { ItemMatchTable } from './ItemMatchTable';
import { OptionATable } from './OptionATable';
import { OptionBBreakdown } from './OptionBBreakdown';

// ─── Phase 1: pixel-identical extraction ──────────────────────────────────────
// This component reproduces the EXACT markup that Compare.tsx and Cart.tsx
// produce today, with no layout changes. Phase 2 will apply the two-column
// sticky restyle inside this single component.

export interface CompareViewProps {
  result: CompareResult;
  priceMode: 'unit' | 'line';
  /**
   * Cart only: render prop called per super row in Option A (handoff button + partial count).
   * Omit → Option A is read-only (Compare page).
   */
  renderOptionAAction?: (superKey: SuperKey) => ReactNode;
  /**
   * Cart only: JSX rendered below OptionBBreakdown (Option B handoff buttons + explainer).
   * Omit → no footer (Compare page).
   */
  optionBFooter?: ReactNode;
  /**
   * Cart only: JSX rendered above Option A (opportunities section / hero callout).
   * Omit → nothing rendered (Compare page).
   */
  topSlot?: ReactNode;
  /**
   * Both callers (different content):
   *   Cart → transparency line ("Comparamos X de Y productos")
   *   Compare → emerald savings summary card
   * Omit → nothing rendered.
   */
  noticeSlot?: ReactNode;
  /**
   * 'tabbed' → Compare page layout: options tab + detail tab.
   * 'stacked' → Cart Comparar tab layout: everything stacked vertically.
   */
  layout?: 'stacked' | 'tabbed';
  /**
   * 'tabbed' layout only: the currently active tab controlled by the parent.
   * Parent owns tab state; CompareView renders the correct panel.
   */
  activeTab?: 'options' | 'detail';
}

export function CompareView({
  result,
  priceMode,
  renderOptionAAction,
  optionBFooter,
  topSlot,
  noticeSlot,
  layout = 'stacked',
  activeTab = 'options',
}: CompareViewProps) {
  const cheapestA = result.option_a[0];
  const savings = result.option_b.savings_vs_option_a;

  // ── Shared sub-sections ────────────────────────────────────────────────────

  const optionACard = (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="font-bold text-gray-900">Opción A — Todo en un super</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {renderOptionAAction
              ? 'Comprás todo en un solo super — elegí cuál'
              : 'Comprás todo en el super más barato para tu lista'}
          </p>
        </div>
        {cheapestA && (
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900">{pesos(cheapestA.total)}</p>
            <p className="text-xs text-gray-500">{cheapestA.coverage}% de ítems</p>
          </div>
        )}
      </div>
      <OptionATable summaries={result.option_a} renderAction={renderOptionAAction} />
      {/* Explainer + disclaimer — rendered only when Cart provides handoff actions */}
      {renderOptionAAction && result.option_a.length > 0 && (
        <div className="mt-3 space-y-0.5">
          <p className="text-xs text-gray-500">
            Te abrimos la tienda del super con tu carrito cargado. Completás la compra ahí.
          </p>
          <p className="text-xs text-gray-500">Los precios pueden variar al momento de pagar.</p>
        </div>
      )}
    </div>
  );

  const optionBCard = (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="font-bold text-gray-900">Opción B — El más barato por ítem</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Dividís la compra y llevás cada producto del super que lo tiene más barato
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900">{pesos(result.option_b.total)}</p>
          {savings > 0 && (
            <p className="text-xs text-green-600 font-semibold">
              Ahorrás {pesos(savings)} vs Opción A
            </p>
          )}
        </div>
      </div>
      <OptionBBreakdown result={result.option_b} items={result.items} />
      {optionBFooter}
    </div>
  );

  const detailCard = (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h2 className="font-bold text-gray-900 mb-4">Precios por producto y super</h2>
      <ItemMatchTable items={result.items} priceMode={priceMode} />
    </div>
  );

  // ── Tabbed layout (Compare page) ───────────────────────────────────────────
  if (layout === 'tabbed') {
    return (
      <div>
        {activeTab === 'options' && (
          <div className="space-y-6">
            {optionACard}
            {optionBCard}
            {noticeSlot}
          </div>
        )}
        {activeTab === 'detail' && detailCard}
      </div>
    );
  }

  // ── Stacked layout (Cart Comparar tab) ────────────────────────────────────
  return (
    <div className="space-y-6">
      {topSlot}
      {noticeSlot}
      {optionACard}
      {optionBCard}
      {detailCard}
    </div>
  );
}
