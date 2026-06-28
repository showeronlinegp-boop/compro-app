import { useState } from 'react';
import { Link } from 'react-router-dom';
import FreqModal from '../components/FreqModal';
import { EmptyState } from '../components/EmptyState';
import { PageContainer } from '../components/layout/PageContainer';
import { pesos, superCfg } from '../supers';
import type { Interest, Product } from '../types/api';

export interface InteresesProps {
  interests: Interest[];
  onToggleInterest: (item: Product) => Promise<void>;
  onAddToShopping: (item: Product, days: number) => Promise<void>;
  shoppingIds: Set<number>;
}

export default function Intereses({
  interests,
  onToggleInterest,
  onAddToShopping,
  shoppingIds,
}: InteresesProps) {
  const [freqTarget, setFreqTarget] = useState<Interest | null>(null);

  async function confirmFreq(days: number) {
    if (!freqTarget) return;
    await onAddToShopping(freqTarget, days);
    setFreqTarget(null);
  }

  if (interests.length === 0) {
    return (
      <PageContainer>
        <EmptyState
          icon="♡"
          title="No tenés intereses guardados"
          description='Buscá productos en "Explorar" y guardá los que te interesan'
          action={
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
            >
              Ir a Explorar
            </Link>
          }
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <h1 className="sr-only">Mis Intereses</h1>
      <p className="text-xs text-gray-400 mb-4">{interests.length} productos guardados</p>

      <div className="flex flex-col gap-2">
        {interests.map((item) => {
          const cfg = superCfg(item.super);
          const price = item.offer_price ?? item.raw_price;
          const inList = shoppingIds.has(item.id);

          return (
            <div
              key={item.interest_id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3 p-3 hover:shadow-md transition-shadow"
            >
              {/* Imagen */}
              <div className="w-14 h-14 flex-shrink-0 rounded-xl bg-gray-50 flex items-center justify-center overflow-hidden">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-2xl text-gray-200">🛒</span>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span
                    className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}
                  >
                    {cfg.label}
                  </span>
                  {item.discount_pct > 0 && (
                    <span className="text-xs font-bold text-red-500">-{item.discount_pct}%</span>
                  )}
                </div>
                <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-sm font-bold text-gray-900">{pesos(price)}</span>
                  {item.offer_price && (
                    <span className="text-xs text-gray-400 line-through">
                      {pesos(item.raw_price)}
                    </span>
                  )}
                </div>
              </div>

              {/* Acciones */}
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                {!inList ? (
                  <button
                    type="button"
                    onClick={() => setFreqTarget(item)}
                    className="text-xs px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100 font-medium transition-colors"
                  >
                    + Lista
                  </button>
                ) : (
                  <span className="text-xs px-3 py-1.5 rounded-xl bg-green-50 text-green-600 border border-green-200 font-medium text-center">
                    ✓ En lista
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onToggleInterest(item)}
                  className="text-xs px-3 py-1.5 rounded-xl bg-gray-50 text-gray-500 border border-gray-200 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
                >
                  Quitar
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {freqTarget && (
        <FreqModal
          product={freqTarget}
          onConfirm={confirmFreq}
          onClose={() => setFreqTarget(null)}
        />
      )}
    </PageContainer>
  );
}
