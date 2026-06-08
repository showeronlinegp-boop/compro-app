import { superCfg, pesos } from '../supers.js';

export default function GroupedCard({ group }) {
  const { name, image_url, variants } = group;

  if (!variants?.length) return null;

  // Ordenar por precio efectivo ascendente
  const sorted = [...variants].sort((a, b) => {
    const pa = a.offer_price ?? a.raw_price;
    const pb = b.offer_price ?? b.raw_price;
    return pa - pb;
  });

  const cheapest = sorted[0];
  const cheapestPrice = cheapest.offer_price ?? cheapest.raw_price;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col hover:shadow-md transition-shadow duration-200">
      {/* Imagen */}
      <div className="relative bg-gray-50 h-36 flex items-center justify-center p-3">
        {image_url
          ? <img src={image_url} alt={name} className="h-full object-contain" />
          : <span className="text-5xl text-gray-200">🛒</span>
        }
        <span className="absolute top-2 left-2 bg-white/90 text-gray-500 text-xs font-semibold px-2 py-0.5 rounded-full border border-gray-200">
          {variants.length} supers
        </span>
      </div>

      {/* Nombre */}
      <div className="px-3 pt-2 pb-1">
        <p className="text-xs font-medium text-gray-800 leading-snug line-clamp-2">
          {name}
        </p>
      </div>

      {/* Fila de precios por super */}
      <div className="px-3 pb-3 flex flex-col gap-1 mt-1">
        {sorted.map(v => {
          const cfg   = superCfg(v.super);
          const price = v.offer_price ?? v.raw_price;
          const isBest = price === cheapestPrice;

          return (
            <a
              key={v.super}
              href={v.product_url}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center justify-between rounded-xl px-2 py-1 border text-xs transition-colors hover:opacity-80 ${
                isBest
                  ? 'bg-green-50 border-green-200'
                  : 'bg-gray-50 border-gray-100'
              }`}
            >
              <span className={`font-bold px-1.5 py-0.5 rounded-md text-white text-[10px] ${cfg.bg}`}>
                {cfg.label}
              </span>
              <div className="flex items-center gap-1.5">
                {v.offer_price && (
                  <span className="text-gray-400 line-through">{pesos(v.raw_price)}</span>
                )}
                <span className={`font-bold ${isBest ? 'text-green-700' : 'text-gray-800'}`}>
                  {pesos(price)}
                </span>
                {isBest && <span className="text-green-600 font-bold">✓</span>}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
