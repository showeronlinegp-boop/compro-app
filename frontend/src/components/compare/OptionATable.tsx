import { pesos, superCfg } from '../../supers';
import type { SuperSummary } from '../../types/api';

interface OptionATableProps {
  summaries: SuperSummary[];
}

export function OptionATable({ summaries }: OptionATableProps) {
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
            className={`rounded-2xl border p-4 flex items-center justify-between ${
              isBest ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100 bg-white'
            }`}
          >
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
              <p className={`text-lg font-bold ${isBest ? 'text-indigo-700' : 'text-gray-800'}`}>
                {pesos(s.total)}
              </p>
              {!isBest && best && (
                <p className="text-xs text-indigo-500">+{pesos(s.total - best.total)}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
