import { useCart } from '../contexts/CartContext';
import { pesos } from '../supers';

export default function Cart() {
  const { items, clear, updateQty, removeItem } = useCart();

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center text-gray-400">
        <p className="text-5xl mb-4">🛒</p>
        <p className="font-medium text-lg">Tu carrito está vacío</p>
        <p className="text-sm mt-2">
          Agregá productos desde Explorar o Intereses con el botón &quot;+ Carrito&quot;
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-bold text-gray-900">
          Carrito ({items.length} {items.length === 1 ? 'artículo' : 'artículos'})
        </h1>
        <button
          type="button"
          onClick={() => {
            clear().catch(console.error);
          }}
          className="text-xs font-medium px-3 py-1.5 rounded-xl border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
        >
          Limpiar carrito
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {items.map((item) => {
          const refPrice = item.offer_price ?? item.raw_price;

          return (
            <div
              key={item.cart_item_id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3 p-3 hover:shadow-md transition-shadow"
            >
              {/* Image */}
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt={item.name}
                  className="w-16 h-16 object-contain rounded-xl bg-gray-50 shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-gray-100 shrink-0" />
              )}

              {/* Name + reference price */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 leading-snug line-clamp-2">
                  {item.name}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  <span className="font-semibold text-gray-600">{pesos(refPrice)}</span>{' '}
                  <span className="italic">precio de referencia</span>
                </p>
              </div>

              {/* Qty stepper */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  aria-label="Reducir cantidad"
                  onClick={() => {
                    if (item.quantity === 1) {
                      removeItem(item.cart_item_id).catch(console.error);
                    } else {
                      updateQty(item.cart_item_id, item.quantity - 1).catch(console.error);
                    }
                  }}
                  className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 font-bold text-sm flex items-center justify-center hover:bg-gray-200 transition-colors"
                >
                  −
                </button>
                <span className="w-6 text-center text-sm font-semibold text-gray-800">
                  {item.quantity}
                </span>
                <button
                  type="button"
                  aria-label="Aumentar cantidad"
                  onClick={() => {
                    updateQty(item.cart_item_id, item.quantity + 1).catch(console.error);
                  }}
                  className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 font-bold text-sm flex items-center justify-center hover:bg-gray-200 transition-colors"
                >
                  +
                </button>
              </div>

              {/* Remove */}
              <button
                type="button"
                aria-label="Eliminar del carrito"
                onClick={() => {
                  removeItem(item.cart_item_id).catch(console.error);
                }}
                className="w-7 h-7 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors shrink-0"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
