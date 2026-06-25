import { useEffect, useState } from 'react';
import { ItemMatchTable, OptionATable, OptionBBreakdown } from '../components/compare';
import { api } from '../api';
import { pesos, superCfg } from '../supers';
import type { CompareResult } from '../types/api';

// ─── Compare page ─────────────────────────────────────────────────────────────

export default function Compare() {
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'options' | 'detail'>('options');

  useEffect(() => {
    api.shopping
      .compare()
      .then(setResult)
      .catch((e) => {
        console.error(e);
        setError('No se pudo cargar la comparación.');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center text-gray-400 text-sm">
        Calculando comparación…
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center text-red-400 text-sm">{error}</div>
    );
  }

  if (!result || result.items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center text-gray-400">
        <p className="text-4xl mb-3">🔍</p>
        <p className="font-medium">Sin datos para comparar</p>
        <p className="text-sm mt-1">
          Agregá productos a tu lista de compras y sincronizá los supers primero
        </p>
      </div>
    );
  }

  const cheapestA = result.option_a[0];
  const savings = result.option_b.savings_vs_option_a;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Comparador multi-super</h1>
      <p className="text-sm text-gray-500 mb-6">
        {result.items.length} productos de tu lista de compras
      </p>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl mb-6 w-fit">
        {[
          { id: 'options' as const, label: '💰 Opciones' },
          { id: 'detail' as const, label: '📋 Detalle' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setView(t.id)}
            className={`text-sm font-semibold px-4 py-2 rounded-xl transition-colors ${
              view === t.id
                ? 'bg-white shadow-sm text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === 'options' && (
        <div className="space-y-6">
          {/* Opción A */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="font-bold text-gray-900">Opción A — Todo en un super</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Comprás todo en el super más barato para tu lista
                </p>
              </div>
              {cheapestA && (
                <div className="text-right">
                  <p className="text-2xl font-bold text-gray-900">{pesos(cheapestA.total)}</p>
                  <p className="text-xs text-gray-500">{cheapestA.coverage}% de ítems</p>
                </div>
              )}
            </div>
            <OptionATable summaries={result.option_a} />
          </div>

          {/* Opción B */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="font-bold text-gray-900">Opción B — El más barato por ítem</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Dividís la compra y llevás cada producto del super que lo tiene más barato
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-gray-900">{pesos(result.option_b.total)}</p>
                {savings > 0 && (
                  <p className="text-xs text-green-600 font-semibold">
                    Ahorrás {pesos(savings)} vs Opción A
                  </p>
                )}
              </div>
            </div>
            <OptionBBreakdown result={result.option_b} items={result.items} />
          </div>

          {/* Resumen de ahorro */}
          {savings > 0 && cheapestA && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
              <p className="text-sm font-semibold text-emerald-800">
                Dividir la compra te ahorra{' '}
                <span className="text-emerald-700 font-bold">{pesos(savings)}</span> vs comprar todo en{' '}
                {superCfg(cheapestA.super).label}
              </p>
              <p className="text-xs text-emerald-600 mt-1">
                Tiene sentido si los supers están cerca uno del otro
              </p>
            </div>
          )}
        </div>
      )}

      {view === 'detail' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-bold text-gray-900 mb-4">Precios por producto y super</h2>
          <ItemMatchTable items={result.items} priceMode="unit" />
        </div>
      )}
    </div>
  );
}
