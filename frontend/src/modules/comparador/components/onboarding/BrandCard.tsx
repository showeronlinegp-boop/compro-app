import type { TierOrPriceDriven } from './types';

export interface BrandCardProps {
  label: string;
  sublabel: string;
  value: TierOrPriceDriven;
  selected: boolean;
  onSelect: () => void;
}

export function BrandCard({ label, sublabel, value, selected, onSelect }: BrandCardProps) {
  const isPriceDriven = value === 'price_driven';
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex-1 text-center p-3 rounded-2xl border-2 transition-all ${
        selected
          ? isPriceDriven
            ? 'border-emerald-500 bg-emerald-50'
            : 'border-indigo-500 bg-indigo-50'
          : 'border-gray-100 bg-white hover:border-gray-300'
      }`}
    >
      <p className={`text-base font-bold mb-0.5 ${selected ? (isPriceDriven ? 'text-emerald-700' : 'text-indigo-700') : 'text-gray-800'}`}>
        {label}
      </p>
      <p className="text-xs text-gray-500">{sublabel}</p>
    </button>
  );
}
