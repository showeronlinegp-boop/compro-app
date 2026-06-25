import { useCart } from '../contexts/CartContext';
import { pesos, superCfg } from '../supers';
import type { Product } from '../types/api';
import ProductImage from './ProductImage';

export interface ProductCardProps {
  product: Product;
  isInterest: boolean;
  onToggleInterest: (product: Product) => void;
  onAddToShopping: (product: Product) => void;
}

export default function ProductCard({
  product,
  isInterest,
  onToggleInterest,
  onAddToShopping,
}: ProductCardProps) {
  const { addItem } = useCart();
  const cfg = superCfg(product.super);
  const price = product.offer_price ?? product.raw_price;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col hover:shadow-md transition-shadow duration-200">
      {/* Imagen */}
      <div className="relative bg-gray-50 h-40 flex items-center justify-center p-3">
        <ProductImage
          sources={[product.image_url]}
          alt={product.name}
          className="h-full object-contain"
        />
        {product.discount_pct > 0 && (
          <span className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            -{product.discount_pct}%
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col flex-1 gap-2">
        <span
          className={`self-start text-xs font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}
        >
          {cfg.label}
        </span>

        <p className="text-sm font-medium text-gray-800 leading-snug line-clamp-2 flex-1">
          {product.name}
        </p>

        <div className="flex items-end gap-2">
          <span className="text-base font-bold text-gray-900">{pesos(price)}</span>
          {product.offer_price && (
            <span className="text-xs text-gray-400 line-through mb-0.5">
              {pesos(product.raw_price)}
            </span>
          )}
        </div>

        {product.promotions?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {product.promotions.map((promo) => (
              <span
                key={promo.label}
                className="self-start text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800"
              >
                {promo.label}
              </span>
            ))}
          </div>
        )}

        {/* Acciones */}
        <div className="flex gap-1.5 mt-1">
          <button
            type="button"
            onClick={() => onToggleInterest(product)}
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
              onClick={() => onAddToShopping(product)}
              title="Agregar a lista de compras"
              className="text-xs px-2.5 py-1.5 rounded-xl font-medium border bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100 transition-colors"
            >
              + Lista
            </button>
          )}

          <button
            type="button"
            aria-label="Agregar al carrito"
            onClick={() => {
              addItem(product.id).catch(console.error);
            }}
            className="text-xs px-2.5 py-1.5 rounded-xl font-medium border bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 transition-colors"
          >
            + Carrito
          </button>
        </div>
      </div>
    </div>
  );
}
