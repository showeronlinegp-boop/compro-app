import type React from 'react';
import { pesos, superCfg } from '../../supers';
import type { SuperKey, SuperSummary } from '../../types/api';

interface OptionATableProps {
  summaries: SuperSummary[];
  /**
   * Optional render prop called once per super row. The table stays purely
   * presentational — it receives the super key and renders whatever the caller
   * provides (e.g. a handoff button). Omit for read-only usage.
   */
  renderAction?: (superKey: SuperKey) => React.ReactNode;
}

export function OptionATable({ summaries, renderAction }: OptionATableProps) {
  if (summaries.length === 0) return null;
  const [best] = summaries;

  return (
    <div className="space-y-2">
      {summaries.map((s, i) => {
        const cfg = superCfg(s.super);
        const isBest = i === 0;
        return (
          <div
            key={s.super}
            className={`rounded-2xl border p-4 ${
              isBest ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100 bg-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isBest && (
                  <span className="text-xs font-bold bg-indigo-600 text-white px-2 py-0.5 rounded-full">
                    MÁS BARATO
                  </span>
                )}
                <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                  {cfg.label}
                </span>
                <span className="text-xs text-gray-500">
                  {s.coverage}% de ítems (
                  {s.missing_items > 0 ? `faltan ${s.missing_items}` : 'completo'})
                </span>
              </div>
              <div className="text-right">
                <p
                  className={`text-lg font-bold tabular-nums ${isBest ? 'text-indigo-700' : 'text-gray-800'}`}
                >
                  {pesos(s.total)}
                </p>
                {!isBest && best && (
                  <p className="text-xs tabular-nums text-indigo-500">
                    +{pesos(s.total - best.total)}
                  </p>
                )}
              </div>
            </div>
            {renderAction && (
              <div className="mt-3">{renderAction(s.super as SuperKey)}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
