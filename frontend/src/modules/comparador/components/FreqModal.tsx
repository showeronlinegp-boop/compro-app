import { useState } from 'react';
import { FREQ_OPTIONS } from '../supers';
import type { Product, ShoppingItem } from '../types/api';

export interface FreqModalProps {
  product: ShoppingItem | Product;
  onConfirm: (days: number) => void;
  onClose: () => void;
}

export default function FreqModal({ product, onConfirm, onClose }: FreqModalProps) {
  const [days, setDays] = useState(7);

  return (
    <dialog
      open
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 m-0 w-full h-full max-w-full max-h-full border-0 bg-transparent"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div
        className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-gray-900 mb-1">Agregar a lista de compras</h3>
        <p className="text-sm text-gray-500 mb-4 line-clamp-2">{product.name}</p>

        <p className="text-xs font-medium text-gray-600 mb-2">¿Con qué frecuencia lo comprás?</p>
        <div className="flex flex-col gap-2 mb-5">
          {FREQ_OPTIONS.map((o) => (
            <button
              key={o.days}
              type="button"
              onClick={() => setDays(o.days)}
              className={`text-sm py-2 px-4 rounded-xl border font-medium transition-colors ${
                days === o.days
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(days)}
            className="flex-1 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
          >
            Agregar
          </button>
        </div>
      </div>
    </dialog>
  );
}
