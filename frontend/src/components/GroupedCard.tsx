import { pesos, superCfg } from '../supers';
import type { Product, ProductGroup, Promotion } from '../types/api';
import AddToCartButton from './AddToCartButton';
import ProductImage from './ProductImage';

export interface GroupedCardProps {
  group: ProductGroup;
  interestIds?: Set<number>;
  onToggleInterest?: (p: Product) => void;
  onAddToShopping?: (p: Product) => void;
}

/**
 * Some supers (Carrefour) store internal promo codes like
 * "PROMO-2do al 50% Max 48 unidades-Reg-2-50-AS9". Keep the human-readable head:
 * drop the "PROMO-" prefix and the "-Reg-..." engine suffix. DIA labels
 * ("2do al 80%", "2x1") have neither, so they pass through unchanged.
 */
function cleanPromoLabel(label: string | null | undefined): string | null | undefined {
  if (!label) return label;
  return label
    .replace(/^PROMO-/i, '') // Carrefour code prefix
    .replace(/-Reg-.*$/i, '') // Carrefour engine suffix
    .replace(/\s+Max\s+\d+\s+unidades.*$/i, '') // "Max 24 unidades Combinable QUILMES"
    .replace(/\s+Combinable.*$/i, '') // bare "Combinable ..." qualifier
    .trim();
}

/**
 * Effective per-unit price under a conditional promo ("2do al 80%", "3x2", etc).
 *
 * For a "buy N, the Nth at X% off" promo you pay (N-1) units full + 1 at (1 - X),
 * so the per-unit price = base * (N - X/100) / N.
 * Example: $4.635 with "2do al 80%" → 4635 * (2 - 0.8)/2 = $2.781 c/u.
 *
 * Returns null when the variant has no usable conditional promo — we never
 * fabricate a discount.
 */
function promoUnitPrice(
  v: Product,
): { perUnit: number; label: string | null | undefined; minQty: number } | null {
  const base = v.offer_price ?? v.raw_price;
  if (base == null) return null;
  const promo: Promotion | undefined = (v.promotions ?? []).find(
    (p) => (p.min_qty ?? 0) >= 2 && (p.discount_pct ?? 0) > 0,
  );
  if (!promo) return null;
  // Capture with explicit ?? 0 fallback to mirror runtime behavior.
  // The .find predicate already guarantees min_qty >= 2 and discount_pct > 0,
  // so ?? 0 is a no-op on real data but satisfies noUncheckedIndexedAccess.
  const n = promo.min_qty ?? 0;
  const pct = promo.discount_pct ?? 0;
  const perUnit = (base * (n - pct / 100)) / n;
  return { perUnit, label: cleanPromoLabel(promo.label), minQty: n };
}

/** Price used to rank/compare a variant: the promo per-unit when it applies, else the shelf price. */
function comparePrice(v: Product): number | null {
  return promoUnitPrice(v)?.perUnit ?? v.offer_price ?? v.raw_price;
}

export default function GroupedCard({
  group,
  interestIds,
  onToggleInterest,
  onAddToShopping,
}: GroupedCardProps) {
  const { name, image_url, variants } = group;

  if (!variants?.length) return null;

  // Sort ascending by comparable price (promo counts for ranking).
  const sorted = [...variants].sort((a, b) => (comparePrice(a) ?? 0) - (comparePrice(b) ?? 0));

  // Guard sorted[0] for noUncheckedIndexedAccess — unreachable at runtime
  // because variants.length > 0 is already checked, but TS needs the narrowing.
  const target = sorted[0];
  if (!target) return null;

  const isComparison = sorted.length > 1;
  const bestPrice = comparePrice(target);

  const isInterest = interestIds?.has(target.id) ?? false;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col hover:shadow-md transition-shadow duration-200">
      {/* Imagen */}
      <div className="relative bg-gray-50 h-36 flex items-center justify-center p-3">
        <ProductImage
          sources={[image_url, ...sorted.map((v) => v.image_url)]}
          alt={name}
          className="h-full object-contain"
        />
      </div>

      {/* Nombre */}
      <div className="px-3 pt-2 pb-1">
        <p className="text-xs font-medium text-gray-800 leading-snug line-clamp-2">{name}</p>
      </div>

      {/* Fila de precios por super */}
      <div className="px-3 pb-2 flex flex-col gap-1 mt-1 flex-1">
        {sorted.map((v) => {
          const cfg = superCfg(v.super);
          const price = v.offer_price ?? v.raw_price;
          const promo = promoUnitPrice(v);
          // Label-only promos (e.g. VEA's "2do al 50%" from marketing collections):
          // shown as informational badges, never as a computed per-unit price.
          const infoPromos = (v.promotions ?? []).filter((pr) => pr.type === 'other');
          const isBest = isComparison && comparePrice(v) === bestPrice;

          return (
            <div
              key={`${v.super}-${v.product_id}`}
              className={`rounded-xl border px-2.5 py-1.5 text-xs ${
                isBest ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100'
              }`}
            >
              {/* Precio real de góndola (1 unidad) — siempre honesto */}
              <a
                href={v.product_url ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-2 transition-colors hover:opacity-80"
              >
                <span
                  className={`shrink-0 font-bold px-1.5 py-0.5 rounded-md text-white text-[10px] ${cfg.bg}`}
                >
                  {cfg.label}
                </span>
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  {v.offer_price && (
                    <span className="text-gray-400 line-through">{pesos(v.raw_price)}</span>
                  )}
                  <span
                    className={`font-bold ${isBest && !promo ? 'text-green-700' : 'text-gray-800'}`}
                  >
                    {pesos(price)}
                  </span>
                  {isBest && !promo && <span className="text-green-600 font-bold">✓</span>}
                </div>
              </a>

              {/* Precio efectivo por la promo — etiquetado para no confundir */}
              {promo && (
                <div className="mt-1 flex items-center justify-between gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-1.5 py-1">
                  <span
                    className="min-w-0 truncate text-[10px] font-bold text-amber-700"
                    title={promo.label ?? undefined}
                  >
                    🏷️ {promo.label}
                  </span>
                  <div className="flex shrink-0 items-center gap-1 whitespace-nowrap">
                    <span className={`font-bold ${isBest ? 'text-green-700' : 'text-amber-800'}`}>
                      {pesos(promo.perUnit)}
                    </span>
                    <span className="text-[10px] text-amber-600">c/u</span>
                    {isBest && <span className="text-green-600 font-bold">✓</span>}
                  </div>
                </div>
              )}

              {/* Promos informativas (sin precio calculado) — p. ej. "2do al 50%" de VEA */}
              {infoPromos.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {infoPromos.map((pr) => (
                    <span
                      key={pr.label}
                      title={pr.label}
                      className="max-w-full truncate rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700"
                    >
                      🎉 {pr.label}
                    </span>
                  ))}
                </div>
              )}

              {/* Disclaimer por super (p. ej. variación de precio por zona en VEA) */}
              {cfg.note && (
                <p className="mt-1 text-[9px] leading-tight text-gray-400">{cfg.note}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Acciones — operan sobre la mejor oferta */}
      <div className="px-3 pb-3 flex gap-1.5">
        <button
          type="button"
          onClick={() => onToggleInterest?.(target)}
          title={isInterest ? 'Quitar de intereses' : 'Guardar en intereses'}
          className={`flex-1 text-xs py-1.5 rounded-xl font-medium border transition-colors ${
            isInterest
              ? 'bg-pink-50 text-pink-600 border-pink-200 hover:bg-pink-100'
              : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
          }`}
        >
          {isInterest ? '♥ Guardado' : '♡ Guardar'}
        </button>

        {isInterest && (
          <button
            type="button"
            onClick={() => onAddToShopping?.(target)}
            title="Agregar a lista de compras"
            className="text-xs px-2.5 py-1.5 rounded-xl font-medium border bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100 transition-colors"
          >
            + Lista
          </button>
        )}

        <AddToCartButton productId={target.id} />
      </div>
    </div>
  );
}
