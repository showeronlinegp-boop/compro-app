import { pesos, superCfg } from '../../supers';
import type { CompareItem, CompareResult } from '../../types/api';

interface OptionBBreakdownProps {
  result: CompareResult['option_b'];
  items: CompareItem[];
}

export function OptionBBreakdown({ result, items }: OptionBBreakdownProps) {
  const itemMap = new Map(items.map((i) => [i.shopping_id, i]));

  return (
    <div className="space-y-3">
      {/* Resumen por super */}
      <div className="space-y-2">
        {result.by_super.map((s) => {
          const cfg = superCfg(s.super);
          return (
            <div
              key={s.super}
              className="bg-white rounded-xl border border-gray-100 px-4 py-2.5 flex justify-between items-center"
            >
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                {cfg.label}
              </span>
              <span className="text-sm font-semibold text-gray-800">{pesos(s.total)}</span>
            </div>
          );
        })}
      </div>

      {/* Detalle por ítem */}
      <div className="mt-4 space-y-1">
        <p className="text-xs font-semibold text-gray-500 mb-2">Detalle por producto</p>
        {result.breakdown.map((b) => {
          const item = itemMap.get(b.shopping_id);
          if (!item) return null;
          const cfg = superCfg(b.best_super);
          return (
            <div
              key={b.shopping_id}
              className="flex items-center justify-between py-2 px-3 bg-white rounded-xl border border-gray-50 text-sm"
            >
              <p className="text-gray-700 truncate flex-1 mr-3">{item.name}</p>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                  {cfg.label}
                </span>
                <span className="font-semibold text-gray-900">{pesos(b.price)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
