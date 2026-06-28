import { useState } from 'react';
import { FOCUS_RING } from '../styles';
import { superCfg } from '../supers';
import type { PromoOffer } from '../types/api';

export interface PromoPanelProps {
  offers: PromoOffer[];
}

export default function PromoPanel({ offers }: PromoPanelProps) {
  const [activeSuper, setActiveSuper] = useState<string | null>(null);

  if (offers.length === 0) return null;

  const supers = Array.from(new Set(offers.map((o) => o.super)));
  const filtered = activeSuper ? offers.filter((o) => o.super === activeSuper) : offers;

  return (
    <div className="mb-6">
      {/* Filter chips */}
      {supers.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3 scrollbar-hide">
          <button
            type="button"
            onClick={() => setActiveSuper(null)}
            className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${FOCUS_RING} ${
              activeSuper === null
                ? 'bg-gray-800 text-white border-gray-800'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            Todos
          </button>
          {supers.map((s) => {
            const cfg = superCfg(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => setActiveSuper((prev) => (prev === s ? null : s))}
                className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${FOCUS_RING} ${
                  activeSuper === s
                    ? `${cfg.bg} ${cfg.text} border-transparent`
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Scrollable card strip — edge-bleed pattern so last card is never clipped
          by the PageContainer padding. Negative margins pull to the page edge;
          matching padding restores the visual gutter for the first card. */}
      <div
        className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {filtered.map((offer) => {
          const cfg = superCfg(offer.super);

          // Image-only card (Dia-style)
          if (offer.imageUrl && offer.title === null) {
            return (
              <a
                key={offer.id}
                href={offer.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 snap-start relative rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-200 w-56 h-56"
              >
                <img
                  src={offer.imageUrl}
                  alt={`Promo ${cfg.label}`}
                  className="w-full h-full object-contain bg-white"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${cfg.bg} ${cfg.text}`}
                  >
                    {cfg.label}
                  </span>
                  {offer.validity && (
                    <span className="ml-1 text-[10px] text-white/80">{offer.validity}</span>
                  )}
                </div>
              </a>
            );
          }

          // Structured card
          const badge =
            offer.discountPct != null
              ? `${offer.discountPct}%`
              : offer.installments != null
                ? `${offer.installments} cuotas`
                : (offer.title ?? '');

          return (
            <a
              key={offer.id}
              href={offer.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 snap-start rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-200 bg-white w-56 h-56 flex flex-col overflow-hidden"
            >
              {/* Bank logo or colored header */}
              <div className="h-14 flex items-center justify-center bg-gray-50 px-3 border-b border-gray-100">
                {offer.logoUrl ? (
                  <img
                    src={offer.logoUrl}
                    alt={offer.bank ?? 'Bank'}
                    className="max-h-10 max-w-full object-contain"
                  />
                ) : (
                  <span className="text-xs font-semibold text-gray-400 text-center">
                    {offer.bank ?? cfg.label}
                  </span>
                )}
              </div>

              {/* Content */}
              <div className="p-3 flex flex-col gap-1 flex-1">
                {/* Discount badge */}
                {badge && (
                  <span
                    className={`self-start text-sm font-extrabold px-2 py-0.5 rounded-lg ${cfg.bg} ${cfg.text}`}
                  >
                    {badge}
                  </span>
                )}

                {/* Title */}
                {offer.title && (
                  <p className="text-xs font-semibold text-gray-800 leading-snug line-clamp-2">
                    {offer.title}
                  </p>
                )}

                {/* Description */}
                {offer.description && (
                  <p className="text-[11px] text-gray-500 leading-snug line-clamp-2">
                    {offer.description}
                  </p>
                )}
              </div>

              {/* Super badge */}
              <div className="px-3 pb-3">
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${cfg.bg} ${cfg.text}`}
                >
                  {cfg.label}
                </span>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
