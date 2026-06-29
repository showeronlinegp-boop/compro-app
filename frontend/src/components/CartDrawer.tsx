import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import { FOCUS_RING, PRIMARY_CTA } from '../styles';
import { pesos } from '../supers';
import { EmptyState } from './EmptyState';

/**
 * Cart drawer — right-side slide-over for quick cart editing.
 * Opens from the navbar cart icon; "Comparar precios" navigates to /cart and closes.
 */
export function CartDrawer() {
  const { items, itemCount, isOpen, closeCart, clear, updateQty, removeItem } = useCart();
  const navigate = useNavigate();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  // Focus management: save previous focus on open, restore on close
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
      // Small timeout lets the drawer finish painting before focusing
      const id = setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 50);
      return () => clearTimeout(id);
    }

    // Restore focus when drawer closes
    if (previousFocusRef.current instanceof HTMLElement) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [isOpen]);

  // Close on Esc
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeCart();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeCart]);

  if (!isOpen) return null;

  // Header copy: N productos [· M unidades]
  const productWord = items.length === 1 ? 'producto' : 'productos';
  const headerCopy =
    itemCount === items.length
      ? `${items.length} ${productWord}`
      : `${items.length} ${productWord} · ${itemCount} unidades`;

  // Reference subtotal: sum of quantity × (offer_price ?? raw_price)
  const subtotal = items.reduce((acc, item) => {
    return acc + item.quantity * (item.offer_price ?? item.raw_price ?? 0);
  }, 0);

  function handleCompare() {
    navigate('/cart');
    closeCart();
  }

  return (
    <>
      {/* Backdrop */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click is supplementary; Esc key is the keyboard equivalent */}
      <div className="fixed inset-0 z-40 bg-black/40" aria-hidden="true" onClick={closeCart} />

      {/* Drawer panel — plain div (NOT native <dialog>, whose UA styles force
          margin:auto/inset-inline and break the right-edge pinning). */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Carrito"
        className="fixed inset-y-0 right-0 z-50 h-full w-full max-w-md bg-white shadow-xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-bold text-gray-900">Carrito ({headerCopy})</h2>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Cerrar carrito"
            onClick={closeCart}
            className={`w-8 h-8 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center transition-colors ${FOCUS_RING}`}
          >
            ✕
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {items.length === 0 ? (
            <EmptyState
              icon="🛒"
              title="Tu carrito está vacío"
              description='Agregá productos desde Explorar o Intereses con el botón "+ Carrito"'
              action={
                <Link to="/" onClick={closeCart} className={`${PRIMARY_CTA} ${FOCUS_RING}`}>
                  Ir a Explorar
                </Link>
              }
            />
          ) : (
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
                        className={`w-7 h-7 rounded-lg bg-gray-100 text-gray-600 font-bold text-sm flex items-center justify-center hover:bg-gray-200 transition-colors ${FOCUS_RING}`}
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
                        className={`w-7 h-7 rounded-lg bg-gray-100 text-gray-600 font-bold text-sm flex items-center justify-center hover:bg-gray-200 transition-colors ${FOCUS_RING}`}
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
                      className={`w-7 h-7 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors shrink-0 ${FOCUS_RING}`}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer — sticky */}
        {items.length > 0 && (
          <div className="shrink-0 border-t border-gray-100 px-4 py-4 flex flex-col gap-3 bg-white">
            {/* Reference subtotal */}
            <div>
              <p className="text-sm font-semibold text-gray-800">
                Subtotal (referencia): <span className="text-indigo-700">{pesos(subtotal)}</span>
              </p>
              <p className="text-xs text-gray-400 mt-0.5">los precios finales se ven al comparar</p>
            </div>

            {/* Action row */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  clear().catch(console.error);
                }}
                className={`text-xs font-medium px-3 py-2 rounded-xl border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-colors ${FOCUS_RING}`}
              >
                Vaciar carrito
              </button>

              <button
                type="button"
                onClick={handleCompare}
                className={`flex-1 ${PRIMARY_CTA} justify-center ${FOCUS_RING}`}
              >
                Comparar precios
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
