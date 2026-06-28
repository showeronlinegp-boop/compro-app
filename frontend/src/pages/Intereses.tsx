import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import FreqModal from '../components/FreqModal';
import { PageContainer } from '../components/layout/PageContainer';
import { FOCUS_RING, PRIMARY_CTA } from '../styles';
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
            <Link to="/" className={`${PRIMARY_CTA} ${FOCUS_RING}`}>
              Explorar productos
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3">
        {interests.map((item) => {
          const cfg = superCfg(item.super);
          const price = item.offer_price ?? item.raw_price;
          const inList = shoppingIds.has(item.id);

          return (
            <div
              key={item.interest_id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col hover:shadow-md transition-shadow"
            >
              {/* Image area */}
              <div className="w-full aspect-square max-h-40 rounded-t-2xl bg-gray-50 flex items-center justify-center overflow-hidden">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="w-full h-full object-contain p-3"
                  />
                ) : (
                  <span className="text-4xl text-gray-200">🛒</span>
                )}
              </div>

              {/* Card body */}
              <div className="flex flex-col flex-1 p-3 gap-2">
                {/* Super badge + discount */}
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}
                  >
                    {cfg.label}
                  </span>
                  {item.discount_pct > 0 && (
                    <span className="text-xs font-bold text-red-500">-{item.discount_pct}%</span>
                  )}
                </div>

                {/* Product name */}
                <p className="text-sm font-medium text-gray-800 line-clamp-2 flex-1">{item.name}</p>

                {/* Price row */}
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-gray-900">{pesos(price)}</span>
                  {item.offer_price && (
                    <span className="text-xs text-gray-400 line-through">
                      {pesos(item.raw_price)}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-1.5 mt-auto">
                  {!inList ? (
                    <button
                      type="button"
                      onClick={() => setFreqTarget(item)}
                      className={`flex-1 text-xs px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100 font-medium transition-colors ${FOCUS_RING}`}
                    >
                      + Lista
                    </button>
                  ) : (
                    <span className="flex-1 text-xs px-3 py-1.5 rounded-xl bg-green-50 text-green-600 border border-green-200 font-medium text-center">
                      ✓ En lista
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onToggleInterest(item)}
                    className={`text-xs px-3 py-1.5 rounded-xl bg-gray-50 text-gray-500 border border-gray-200 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors ${FOCUS_RING}`}
                  >
                    Quitar
                  </button>
                </div>
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
