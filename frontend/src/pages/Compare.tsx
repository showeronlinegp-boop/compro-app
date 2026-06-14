import { useEffect, useState } from 'react';
import { api } from '../api';
import { pesos, superCfg } from '../supers';
import type { CompareItem, CompareResult, SuperSummary } from '../types/api';

// ─── Option A — Tabla por super ───────────────────────────────────────────────

function OptionATable({ summaries }: { summaries: SuperSummary[] }) {
  if (summaries.length === 0) return null;
  const [best] = summaries;

  return (
    <div className="space-y-2">
      {summaries.map((s, i) => {
        const cfg = superCfg(s.super);
        const isBest = i === 0;
        return (
          <div
            key={s.super}
            className={`rounded-2xl border p-4 flex items-center justify-between ${
              isBest ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100 bg-white'
            }`}
          >
            <div className="flex items-center gap-3">
              {isBest && (
                <span className="text-xs font-bold bg-indigo-600 text-white px-2 py-0.5 rounded-full">
                  MÁS BARATO
                </span>
              )}
              <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                {cfg.label}
              </span>
              <span className="text-xs text-gray-500">
                {s.coverage}% de ítems ({s.missing_items > 0 ? `faltan ${s.missing_items}` : 'completo'})
              </span>
            </div>
            <div className="text-right">
              <p className={`text-lg font-bold ${isBest ? 'text-indigo-700' : 'text-gray-800'}`}>
                {pesos(s.total)}
              </p>
              {isBest && best && s !== best && (
                <p className="text-xs text-indigo-500">ahorrás {pesos(s.total - best.total)}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Option B — Breakdown por ítem ────────────────────────────────────────────

function OptionBBreakdown({
  result,
  items,
}: {
  result: CompareResult['option_b'];
  items: CompareItem[];
}) {
  const itemMap = new Map(items.map((i) => [i.shopping_id, i]));

  return (
    <div className="space-y-3">
      {/* Resumen por super */}
      <div className="space-y-2">
        {result.by_super.map((s) => {
          const cfg = superCfg(s.super);
          return (
            <div
              key={s.super}
              className="bg-white rounded-xl border border-gray-100 px-4 py-2.5 flex justify-between items-center"
            >
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                {cfg.label}
              </span>
              <span className="text-sm font-semibold text-gray-800">{pesos(s.total)}</span>
            </div>
          );
        })}
      </div>

      {/* Detalle por ítem */}
      <div className="mt-4 space-y-1">
        <p className="text-xs font-semibold text-gray-500 mb-2">Detalle por producto</p>
        {result.breakdown.map((b) => {
          const item = itemMap.get(b.shopping_id);
          if (!item) return null;
          const cfg = superCfg(b.best_super);
          return (
            <div
              key={b.shopping_id}
              className="flex items-center justify-between py-2 px-3 bg-white rounded-xl border border-gray-50 text-sm"
            >
              <p className="text-gray-700 truncate flex-1 mr-3">{item.name}</p>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                  {cfg.label}
                </span>
                <span className="font-semibold text-gray-900">{pesos(b.price)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tabla de matches por ítem ────────────────────────────────────────────────

function ItemMatchTable({ items }: { items: CompareItem[] }) {
  const allSupers = [...new Set(items.flatMap((i) => i.matches.map((m) => m.super)))].sort();

  if (items.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-2 pr-3 text-gray-500 font-medium w-40">Producto</th>
            {allSupers.map((s) => {
              const cfg = superCfg(s);
              return (
                <th key={s} className="text-center py-2 px-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                    {cfg.label}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const matchBySuperMap = new Map(item.matches.map((m) => [m.super, m]));
            const bestPrice = Math.min(...item.matches.map((m) => m.price));

            return (
              <tr key={item.shopping_id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-2 pr-3 text-gray-700 font-medium truncate max-w-40">{item.name}</td>
                {allSupers.map((s) => {
                  const match = matchBySuperMap.get(s);
                  const isBest = match?.price === bestPrice;
                  return (
                    <td key={s} className="text-center py-2 px-2">
                      {match ? (
                        <span
                          className={`font-semibold ${isBest ? 'text-indigo-700 font-bold' : 'text-gray-700'}`}
                        >
                          {pesos(match.price)}
                          {match.matched_by === 'name_similarity' && (
                            <span className="text-gray-300 ml-0.5">~</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-200">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-gray-400 mt-2">~ = precio estimado por similitud de nombre</p>
    </div>
  );
}

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
          <ItemMatchTable items={result.items} />
        </div>
      )}
    </div>
  );
}
