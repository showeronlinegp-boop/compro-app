import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api.js';
import { SUPER_KEYS, superCfg } from '../supers.js';
import GroupedCard from '../components/GroupedCard.jsx';
import FreqModal from '../components/FreqModal.jsx';

export default function Explorar({ interests, onToggleInterest, onAddToShopping, syncStatus = [], enrichStatus = {} }) {
  const [products, setProducts]     = useState([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [pages, setPages]           = useState(1);
  const [loading, setLoading]       = useState(false);

  const [categories, setCategories] = useState([]);
  const [q, setQ]               = useState('');
  const [sup, setSup]           = useState('');
  const [category, setCategory] = useState('');
  const [discount, setDiscount] = useState(false);

  const [freqTarget, setFreqTarget] = useState(null);

  useEffect(() => { api.products.categories().then(setCategories); }, []);

  const isSyncing    = syncStatus.some(s => s.status === 'running');
  const isEnriching  = Object.values(enrichStatus).some(s => s.running);
  const enrichEntries = Object.entries(enrichStatus);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    setProducts([]);
    try {
      // Vista unificada: la comparación entre supers es siempre el core.
      // Cada producto aparece; si comparte barcode con otros supers, se compara.
      // El filtro por super = "incluir este super" (la card sigue comparando todos).
      const params = {
        ...(q        && { q }),
        ...(category && { category }),
        ...(discount && { discount: '1' }),
        ...(sup      && { super: sup }),
        page: p,
        limit: 24,
      };

      const res = await api.products.groups(params);

      setProducts(res.data);
      setTotal(res.total);
      setPage(res.page);
      setPages(res.pages);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [q, sup, category, discount]);

  useEffect(() => { load(1); }, [load]);

  // Auto-refresco cada 8s mientras haya sync corriendo para mostrar productos en vivo
  useEffect(() => {
    if (!isSyncing) return;
    const id = setInterval(() => load(page), 8000);
    return () => clearInterval(id);
  }, [isSyncing, load, page]);

  // Refresca productos cuando el enriquecimiento termina para mostrar nuevos precios
  const wasEnriching = useRef(false);
  useEffect(() => {
    if (wasEnriching.current && !isEnriching) load(page);
    wasEnriching.current = isEnriching;
  }, [isEnriching, load, page]);

  const interestIds = new Set(interests.map(i => i.id));

  function handleAddToShopping(product) {
    setFreqTarget(product);
  }

  async function confirmFreq(days) {
    await onAddToShopping(freqTarget, days);
    setFreqTarget(null);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Banner sincronización en vivo */}
      {isSyncing && syncStatus.filter(s => s.status === 'running').map(s => {
        const pct = s.total_leaves > 0 ? Math.round((s.progress_leaf / s.total_leaves) * 100) : 0;
        return (
          <div key={s.super} className="mb-4 bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="animate-spin text-sm">⏳</span>
              <span className="text-sm text-indigo-700 font-semibold">
                Sincronizando {s.super.toUpperCase()}
              </span>
              <span className="ml-auto text-xs text-indigo-500 font-medium">
                {s.progress_leaf}/{s.total_leaves} categorías · {s.product_count?.toLocaleString('es-AR') ?? '…'} productos
              </span>
            </div>
            <div className="w-full bg-indigo-100 rounded-full h-1.5">
              <div
                className="bg-indigo-500 h-1.5 rounded-full transition-all duration-1000"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}

      {/* Banner enriquecimiento en vivo */}
      {enrichEntries.filter(([, s]) => s.running || s.updated > 0).map(([key, s]) => {
        const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
        if (s.running) {
          return (
            <div key={key} className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="animate-spin text-sm">✨</span>
                <span className="text-sm text-amber-700 font-semibold">
                  Enriqueciendo precios de {key.toUpperCase()}
                </span>
                <span className="ml-auto text-xs text-amber-500 font-medium">
                  {s.done.toLocaleString('es-AR')}/{s.total.toLocaleString('es-AR')} · {s.updated} con promo
                </span>
              </div>
              <div className="w-full bg-amber-100 rounded-full h-1.5">
                <div
                  className="bg-amber-500 h-1.5 rounded-full transition-all duration-1000"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        }
        if (s.updated > 0 && !s.running) {
          return (
            <div key={key} className="mb-4 bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center gap-2">
              <span className="text-green-600 text-sm">✅</span>
              <span className="text-sm text-green-700 font-semibold">
                {key.toUpperCase()} enriquecido — {s.updated.toLocaleString('es-AR')} productos con descuento real detectado
              </span>
            </div>
          );
        }
        return null;
      })}

      {/* Buscador */}
      <div className="relative mb-4">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">🔍</span>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Buscar producto…"
          className="w-full pl-10 pr-4 py-3 rounded-2xl border border-gray-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 text-sm"
        />
      </div>

      {/* Categorías */}
      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
          <button
            onClick={() => setCategory('')}
            className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              !category ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            Todo
          </button>
          {categories.map(cat => (
            <button
              key={cat.slug}
              onClick={() => setCategory(c => c === cat.slug ? '' : cat.slug)}
              className={`flex-shrink-0 flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                category === cat.slug
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setSup('')}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
            !sup ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          Todos
        </button>
        {SUPER_KEYS.map(key => {
          const cfg = superCfg(key);
          const active = sup === key;
          return (
            <button
              key={key}
              onClick={() => setSup(active ? '' : key)}
              className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${
                active ? `${cfg.bg} ${cfg.text} border-transparent` : `bg-white ${cfg.text.replace('text-white', 'text-gray-600')} border-gray-200 hover:bg-gray-50`
              }`}
            >
              {cfg.label}
            </button>
          );
        })}
        <div className="w-px bg-gray-200 mx-1" />
        <button
          onClick={() => setDiscount(d => !d)}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
            discount ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          🔥 Con descuento
        </button>
      </div>

      {/* Contador */}
      {!loading && (
        <p className="text-xs text-gray-400 mb-4">
          {total.toLocaleString('es-AR')} productos
        </p>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl h-64 animate-pulse border border-gray-100" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-24 text-gray-400">
          <p className="text-4xl mb-3">🛒</p>
          <p className="font-medium">Sin resultados</p>
          <p className="text-sm mt-1">Probá otros filtros o sincronizá los precios primero</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {products.map(g => (
            <GroupedCard
              key={g.key}
              group={g}
              interestIds={interestIds}
              onToggleInterest={onToggleInterest}
              onAddToShopping={handleAddToShopping}
            />
          ))}
        </div>
      )}

      {/* Paginación */}
      {pages > 1 && (
        <div className="flex justify-center items-center gap-3 mt-8">
          <button
            disabled={page <= 1}
            onClick={() => load(page - 1)}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm disabled:opacity-40 hover:bg-gray-50"
          >
            ← Anterior
          </button>
          <span className="text-sm text-gray-500">{page} / {pages}</span>
          <button
            disabled={page >= pages}
            onClick={() => load(page + 1)}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm disabled:opacity-40 hover:bg-gray-50"
          >
            Siguiente →
          </button>
        </div>
      )}

      {freqTarget && (
        <FreqModal
          product={freqTarget}
          onConfirm={confirmFreq}
          onClose={() => setFreqTarget(null)}
        />
      )}
    </div>
  );
}
