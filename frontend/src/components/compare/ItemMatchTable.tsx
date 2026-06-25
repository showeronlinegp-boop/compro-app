import { pesos, superCfg } from '../../supers';
import type { CompareItem } from '../../types/api';

interface ItemMatchTableProps {
  items: CompareItem[];
  priceMode?: 'unit' | 'line';
}

export function ItemMatchTable({ items, priceMode = 'unit' }: ItemMatchTableProps) {
  const allSupers = [...new Set(items.flatMap((i) => i.matches.map((m) => m.super)))].sort();

  if (items.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      {priceMode === 'line' && (
        <p className="text-xs text-gray-400 mb-2">
          Precios = unitario × cantidad (total por línea)
        </p>
      )}
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-2 pr-3 text-gray-500 font-medium w-40">Producto</th>
            {allSupers.map((s) => {
              const cfg = superCfg(s);
              return (
                <th key={s} className="text-center py-2 px-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                    {cfg.label}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const matchBySuperMap = new Map(item.matches.map((m) => [m.super, m]));
            const prices = item.matches.map((m) => m.price);
            const bestPrice = prices.length ? Math.min(...prices) : null;

            return (
              <tr key={item.shopping_id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-2 pr-3 text-gray-700 font-medium truncate max-w-40">{item.name}</td>
                {allSupers.map((s) => {
                  const match = matchBySuperMap.get(s);
                  const isBest = bestPrice !== null && match?.price === bestPrice;
                  return (
                    <td key={s} className="text-center py-2 px-2">
                      {match ? (
                        <span
                          className={`font-semibold ${isBest ? 'text-indigo-700 font-bold' : 'text-gray-700'}`}
                        >
                          {pesos(match.price)}
                          {match.matched_by === 'name_similarity' && (
                            <span className="text-gray-300 ml-0.5">~</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-200">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-gray-400 mt-2">~ = precio estimado por similitud de nombre</p>
    </div>
  );
}
