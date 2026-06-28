import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { EmptyState } from '../components/EmptyState';
import { CompareView } from '../components/compare/CompareView';
import { PageContainer } from '../components/layout/PageContainer';
import { FOCUS_RING, PRIMARY_CTA } from '../styles';
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
      <PageContainer>
        <div className="py-12 text-center text-gray-400 text-sm">Calculando comparación…</div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <div className="py-12 text-center text-red-400 text-sm">{error}</div>
      </PageContainer>
    );
  }

  if (!result || result.items.length === 0) {
    return (
      <PageContainer>
        <EmptyState
          icon="🔍"
          title="Sin datos para comparar"
          description="Agregá productos a tu lista de compras y sincronizá los supers primero"
          action={
            <Link
              to="/planner"
              className={`${PRIMARY_CTA} ${FOCUS_RING}`}
            >
              Ir al Planner
            </Link>
          }
        />
      </PageContainer>
    );
  }

  const cheapestA = result.option_a[0];
  const savings = result.option_b.savings_vs_option_a;

  // Emerald savings card — Compare-only; passed as noticeSlot to CompareView.
  const emeraldSavingsCard =
    savings > 0 && cheapestA ? (
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
        <p className="text-sm font-semibold text-emerald-800">
          Dividir la compra te ahorra{' '}
          <span className="text-emerald-700 font-bold">{pesos(savings)}</span> vs comprar todo
          en {superCfg(cheapestA.super).label}
        </p>
        <p className="text-xs text-emerald-600 mt-1">
          Tiene sentido si los supers están cerca uno del otro
        </p>
      </div>
    ) : null;

  return (
    <PageContainer>
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
            className={`text-sm font-semibold px-4 py-2 rounded-xl transition-colors ${FOCUS_RING} ${
              view === t.id
                ? 'bg-white shadow-sm text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <CompareView
        result={result}
        priceMode="unit"
        layout="tabbed"
        activeTab={view}
        noticeSlot={emeraldSavingsCard}
      />
    </PageContainer>
  );
}
