import { useCart } from '../contexts/CartContext';

interface AddToCartButtonProps {
  productId: number;
}

export default function AddToCartButton({ productId }: AddToCartButtonProps) {
  const { addItem } = useCart();
  return (
    <button
      type="button"
      aria-label="Agregar al carrito"
      onClick={() => {
        addItem(productId).catch(console.error);
      }}
      className="text-xs px-2.5 py-1.5 rounded-xl font-medium border bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 transition-colors"
    >
      + Carrito
    </button>
  );
}
