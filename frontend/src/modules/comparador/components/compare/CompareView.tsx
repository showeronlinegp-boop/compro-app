import type { ReactNode } from 'react';
import { pesos, superCfg } from '../../supers';
import type { CompareResult, SuperKey } from '../../types/api';
import { TwoColumn } from '../../../../host/ui/layout/TwoColumn';
import { ItemMatchTable } from './ItemMatchTable';
import { OptionATable } from './OptionATable';
import { OptionBBreakdown } from './OptionBBreakdown';

// ─── Phase 2: two-column sticky layout ───────────────────────────────────────
// CompareView now renders the sticky-rail two-column layout at lg+ while keeping
// single-column on mobile. The summary rail shows per-super totals and savings;
// the main column shows options + detail table.

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

// ─── Summary rail ─────────────────────────────────────────────────────────────
// Compact sticky panel: Option A totals + Option B summary.
// Does NOT render handoff buttons (renderOptionAAction/optionBFooter) — those
// stay in the full option cards in the main column to avoid duplicate testids
// and duplicate interactive elements.

interface SummaryRailProps {
  result: CompareResult;
}

function SummaryRail({ result }: SummaryRailProps) {
  const cheapestA = result.option_a[0];
  const savings = result.option_b.savings_vs_option_a;

  return (
    <div className="space-y-4">
      {/* Option A — per-super totals compact */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
          Opción A — Un super
        </p>
        {result.option_a.map((s, i) => {
          const cfg = superCfg(s.super);
          const isBest = i === 0;
          return (
            <div
              key={s.super}
              className={`rounded-xl border px-3 py-2 mb-2 last:mb-0 ${
                isBest ? 'border-indigo-200 bg-indigo-50' : 'border-gray-100 bg-white'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  {isBest && (
                    <span className="text-[10px] font-bold bg-indigo-600 text-white px-1.5 py-0.5 rounded-full shrink-0">
                      ✓
                    </span>
                  )}
                  <span
                    className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.text} shrink-0`}
                  >
                    {cfg.label}
                  </span>
                </div>
                <span
                  className={`text-sm font-bold tabular-nums shrink-0 ${isBest ? 'text-indigo-700' : 'text-gray-800'}`}
                >
                  {pesos(s.total)}
                </span>
              </div>
              <p className="text-[10px] text-gray-400">{s.coverage}% de ítems</p>
            </div>
          );
        })}
      </div>

      {/* Option B — total + savings */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
          Opción B — Mejor por ítem
        </p>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs text-gray-600">Total estimado</span>
          <span className="text-sm font-bold tabular-nums text-gray-900">
            {pesos(result.option_b.total)}
          </span>
        </div>
        {savings > 0 && cheapestA && (
          <p className="text-xs font-semibold text-green-700 mb-2">
            Ahorrás {pesos(savings)} vs {superCfg(cheapestA.super).label}
          </p>
        )}
        {/* Per-super split in Option B */}
        {result.option_b.by_super.map((s) => {
          const cfg = superCfg(s.super);
          return (
            <div
              key={s.super}
              className="flex items-center justify-between gap-2 py-1.5 border-t border-gray-50 first:border-t-0"
            >
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}
              >
                {cfg.label}
              </span>
              <span className="text-xs font-semibold tabular-nums text-gray-700">
                {pesos(s.total)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
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
            <p className="text-2xl font-bold tabular-nums text-gray-900">
              {pesos(cheapestA.total)}
            </p>
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
          <p className="text-2xl font-bold tabular-nums text-gray-900">
            {pesos(result.option_b.total)}
          </p>
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
      {/* Cap the table width so the per-super columns stay close together and a
          row is easy to scan, instead of spreading across the full fluid width. */}
      <div className="max-w-4xl">
        <ItemMatchTable items={result.items} priceMode={priceMode} />
      </div>
    </div>
  );

  // ── Summary rail (shown at lg+ via TwoColumn; content is read-only totals/
  //    savings only — handoff buttons stay in the main optionACard/optionBCard
  //    to avoid duplicate interactive elements) ───────────────────────────────

  const summaryRail = <SummaryRail result={result} />;

  // ── Tabbed layout (Compare page) ───────────────────────────────────────────
  if (layout === 'tabbed') {
    if (activeTab === 'options') {
      return (
        <div className="space-y-6">
          {optionACard}
          {optionBCard}
          {noticeSlot}
        </div>
      );
    }
    // detail tab: two-column — sticky rail on left, full item table on right
    return (
      <TwoColumn
        rail={summaryRail}
        main={detailCard}
        railWidth="md"
        stickyRail
        railTopOffsetClass="top-[4.5rem]"
      />
    );
  }

  // ── Stacked layout (Cart Comparar tab) — two-column at lg+ ────────────────
  // Rail: summary totals (compact) + Option B handoffs
  // Main: top/notice slots + full Option A/B cards + detail table
  const mainContent = (
    <div className="space-y-6">
      {topSlot}
      {noticeSlot}
      {optionACard}
      {optionBCard}
      {detailCard}
    </div>
  );

  return (
    <TwoColumn
      rail={summaryRail}
      main={mainContent}
      railWidth="md"
      stickyRail
      railTopOffsetClass="top-[4.5rem]"
    />
  );
}
