import { useState } from 'react';
import { pesos, superCfg } from '../../supers';
import type { PromoOpportunity } from '../../types/api';

interface PromoNudgeProps {
  opportunity: PromoOpportunity;
  name: string;
  onAgregar: (shoppingId: number, targetQty: number) => Promise<void>;
}

export function PromoNudge({ opportunity, name, onAgregar }: PromoNudgeProps) {
  const [loading, setLoading] = useState(false);

  const bestCfg = superCfg(opportunity.best_super);
  const currentCfg = superCfg(opportunity.current_best_super);

  async function handleAgregar() {
    setLoading(true);
    try {
      await onAgregar(opportunity.shopping_id, opportunity.target_qty);
    } catch {
      // Intentionally silent: user-facing error feedback is deferred cross-cutting debt (TODO).
      // The finally block re-enables the button so the user can retry.
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
      <p className="text-sm text-gray-800">
        Agregá <span className="font-semibold">{opportunity.missing_units}</span> más de{' '}
        <span className="font-semibold">{name}</span> y te conviene{' '}
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold ${bestCfg.bg} ${bestCfg.text}`}
        >
          {bestCfg.label}
        </span>
        {': '}
        <span className="font-semibold">{pesos(opportunity.effective_unit_price_at_target)}</span>{' '}
        c/u <span className="text-gray-500">vs</span>{' '}
        <span className="font-semibold">{pesos(opportunity.current_best_unit_price)}</span> en{' '}
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold ${currentCfg.bg} ${currentCfg.text}`}
        >
          {currentCfg.label}
        </span>
      </p>

      {opportunity.flips_super && (
        <span
          data-testid="flips-badge"
          className="inline-block rounded-full bg-green-100 border border-green-300 px-2 py-0.5 text-xs font-semibold text-green-800"
        >
          Cambia el súper más barato
        </span>
      )}

      <button
        type="button"
        disabled={loading}
        onClick={handleAgregar}
        className="mt-1 rounded-xl bg-amber-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Agregando…' : `Agregar ${opportunity.missing_units} para la promo`}
      </button>
    </div>
  );
}
