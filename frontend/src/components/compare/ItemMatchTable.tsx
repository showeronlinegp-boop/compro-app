import { pesos, superCfg } from '../../supers';
import type { CompareItem } from '../../types/api';
import { InfoBadge, PromoBadge } from './PromoBadge';

interface ItemMatchTableProps {
  items: CompareItem[];
  /**
   * DISPLAY-LABEL hint only. Prices are always pre-multiplied by the caller/back end;
   * this component never performs any multiplication — it renders whatever values it receives.
   */
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
      {/* aria-label identifies the table for screen readers (A11Y-4) */}
      <table className="w-full text-xs" aria-label="Precios por producto y supermercado">
        <thead>
          {/* Sticky thead: position:sticky on each th for cross-browser table support.
              z-10 keeps header above rows; bg-white prevents content showing through.
              top-0 is relative to the scroll container (overflow-x-auto wrapper), so
              vertical sticky works as long as no overflow-y is added to the wrapper. */}
          <tr className="border-b border-gray-100">
            <th
              scope="col"
              className="sticky top-0 bg-white z-10 text-left py-2 pr-3 text-gray-500 font-medium w-40"
            >
              Producto
            </th>
            {allSupers.map((s) => {
              const cfg = superCfg(s);
              return (
                <th key={s} scope="col" className="sticky top-0 bg-white z-10 text-center py-2 px-2">
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}
                  >
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
                {/* Row header for screen readers (scope="row" + th element) */}
                <th
                  scope="row"
                  className="py-2 pr-3 text-gray-700 font-medium text-left truncate max-w-40 font-normal"
                >
                  {item.name}
                </th>
                {allSupers.map((s) => {
                  const match = matchBySuperMap.get(s);
                  const isBest = bestPrice !== null && match?.price === bestPrice;
                  return (
                    <td key={s} className="text-center py-2 px-2">
                      {match ? (
                        <div className="flex flex-col items-center gap-0.5">
                          {match.unit_price !== match.price && (
                            <span
                              data-testid="shelf-strike"
                              className="text-gray-400 line-through text-[10px] tabular-nums"
                            >
                              {pesos(match.unit_price)}
                            </span>
                          )}
                          <span
                            className={`font-semibold tabular-nums ${isBest ? 'text-indigo-700 font-bold' : 'text-gray-700'}`}
                          >
                            {pesos(match.price)}
                            {match.matched_by === 'name_similarity' && (
                              <span className="text-gray-300 ml-0.5">~</span>
                            )}
                          </span>
                          {match.promo_label && <PromoBadge label={match.promo_label} />}
                          {match.info_badges.map((badge, idx) => (
                            // biome-ignore lint/suspicious/noArrayIndexKey: backend deduplicates badges; index is safe here
                            <InfoBadge key={idx} label={badge} />
                          ))}
                        </div>
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
