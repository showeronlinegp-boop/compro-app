import { BrandCard } from './BrandCard';
import type { FormState, TierOrPriceDriven } from './types';

export interface PrefQuestionProps {
  question: string;
  field: keyof Pick<
    FormState,
    | 'pref_almacen_1'
    | 'pref_lacteos'
    | 'pref_almacen_2'
    | 'pref_bebidas'
    | 'pref_limpieza'
    | 'pref_personal'
  >;
  options: Array<{ value: TierOrPriceDriven; label: string; sublabel: string }>;
  form: FormState;
  onChange: (field: keyof FormState, value: TierOrPriceDriven) => void;
}

export function PrefQuestion({ question, field, options, form, onChange }: PrefQuestionProps) {
  return (
    <div className="mb-6">
      <p className="text-sm font-semibold text-gray-800 mb-2">{question}</p>
      <div className="flex gap-2">
        {options.map((opt) => (
          <BrandCard
            key={opt.value}
            label={opt.label}
            sublabel={opt.sublabel}
            value={opt.value}
            selected={form[field] === opt.value}
            onSelect={() => onChange(field, opt.value)}
          />
        ))}
      </div>
    </div>
  );
}
