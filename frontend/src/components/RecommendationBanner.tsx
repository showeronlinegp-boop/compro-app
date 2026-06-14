import { useEffect, useState } from 'react';
import { api } from '../api';
import { pesos, superCfg } from '../supers';
import type { ShoppingRecommendation } from '../types/api';

export default function RecommendationBanner() {
  const [recs, setRecs] = useState<ShoppingRecommendation[]>([]);

  useEffect(() => {
    api.shopping.recommendations().then(setRecs).catch(console.error);
  }, []);

  if (recs.length === 0) return null;

  return (
    <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4">
      <p className="text-sm font-semibold text-amber-800 mb-3">
        🔔 Compras anticipadas recomendadas — estos productos están en oferta y se acerca su fecha
      </p>
      <div className="flex flex-col gap-2">
        {recs.map((rec) => {
          const cfg = superCfg(rec.super);
          const price = rec.offer_price ?? rec.raw_price;
          const days = Math.ceil(rec.days_until_due);

          return (
            <div
              key={rec.shopping_id}
              className="bg-white rounded-xl border border-amber-100 p-3 flex items-center gap-3"
            >
              <div className="w-10 h-10 flex-shrink-0 rounded-lg bg-gray-50 flex items-center justify-center overflow-hidden">
                {rec.image_url ? (
                  <img src={rec.image_url} alt={rec.name} className="w-full h-full object-contain" />
                ) : (
                  <span className="text-lg text-gray-200">🛒</span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                    {cfg.label}
                  </span>
                  <span className="text-xs text-green-700 font-semibold bg-green-50 px-1.5 py-0.5 rounded-full">
                    -{rec.discount_pct}%
                  </span>
                </div>
                <p className="text-sm font-medium text-gray-800 truncate">{rec.name}</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  {days <= 0 ? 'Vence hoy' : `Toca en ${days} día${days !== 1 ? 's' : ''}`}
                </p>
              </div>

              <div className="text-right flex-shrink-0">
                {rec.raw_price && rec.offer_price && (
                  <p className="text-xs text-gray-400 line-through">{pesos(rec.raw_price)}</p>
                )}
                <p className="text-sm font-bold text-gray-900">{pesos(price)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
