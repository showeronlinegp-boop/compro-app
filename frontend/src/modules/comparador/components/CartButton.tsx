import { FOCUS_RING } from '../../../host/ui/styles';
import { useCart } from '../contexts/CartContext';

/** Cart — opens the cart drawer. Botón del header extraído literal del viejo `AppShell`. */
export function CartButton() {
  const { itemCount, openCart } = useCart();

  const cartLabel = itemCount > 0 ? `Carrito (${itemCount})` : 'Carrito';

  return (
    <button
      type="button"
      aria-label={cartLabel}
      onClick={openCart}
      className={`relative inline-flex items-center justify-center w-9 h-9 rounded-xl transition-colors ${FOCUS_RING} text-gray-500 hover:text-gray-800 hover:bg-gray-50`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.8}
        stroke="currentColor"
        className="w-5 h-5"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
        />
      </svg>
      {itemCount > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
          {itemCount}
        </span>
      )}
    </button>
  );
}
