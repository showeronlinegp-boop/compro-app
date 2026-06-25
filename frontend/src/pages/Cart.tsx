import { useCart } from '../contexts/CartContext';

export default function Cart() {
  const { items } = useCart();

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-500 text-sm">Tu carrito está vacío.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <p className="text-gray-700 text-sm">{items.length} artículo(s) en el carrito.</p>
    </div>
  );
}
