import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import FreqModal from '../components/FreqModal';
import GroupedCard from '../components/GroupedCard';
import PromoPanel from '../components/PromoPanel';
import type {
  EnrichStatus,
  GroupsResult,
  Interest,
  Product,
  PromoOffer,
  SortKey,
  SyncLog,
  TaxonomyEntry,
} from '../types/api';

const SKELETON_KEYS = Array.from({ length: 12 }, (_, i) => `sk-${i}`) as string[];

const SORT_OPTIONS: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: 'relevance', label: 'Relevancia' },
  { value: 'price_asc', label: 'Precio: menor a mayor' },
  { value: 'price_desc', label: 'Precio: mayor a menor' },
  { value: 'discount_desc', label: 'Mayor descuento' },
];

export interface ExplorarProps {
  interests: Interest[];
  onToggleInterest: (p: Product) => Promise<void>;
  onAddToShopping: (p: Product, days: number) => Promise<void>;
  syncStatus?: SyncLog[];
  enrichStatus?: Record<string, EnrichStatus>;
  /** Supers whose enrichment completed during THIS session — drives the transient success banner. */
  enrichDoneKeys?: string[];
  promos?: PromoOffer[];
}

export default function Explorar({
  interests,
  onToggleInterest,
  onAddToShopping,
  syncStatus = [],
  enrichStatus = {},
  enrichDoneKeys = [],
  promos = [],
}: ExplorarProps) {
  const [groups, setGroups] = useState<GroupsResult['data']>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const [categories, setCategories] = useState<TaxonomyEntry[]>([]);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [discount, setDiscount] = useState(false);
  const [sort, setSort] = useState<SortKey>('relevance');

  const [freqTarget, setFreqTarget] = useState<Product | null>(null);

  useEffect(() => {
    api.products.categories().then(setCategories).catch(console.error);
  }, []);

  const isSyncing = syncStatus.some((s) => s.status === 'running');
  const isEnriching = Object.values(enrichStatus).some((s) => s.running);
  const enrichEntries = Object.entries(enrichStatus);

  const reqIdRef = useRef(0);

  const load = useCallback(
    async (p = 1) => {
      const reqId = ++reqIdRef.current;
      setLoading(true);
      setGroups([]);
      try {
        const params: Record<string, string> = {
          page: String(p),
          limit: '24',
        };
        if (q) params.q = q;
        if (category) params.category = category;
        if (discount) params.discount = '1';
        if (sort !== 'relevance') params.sort = sort;

        const res = await api.products.groups(params);
        if (reqId !== reqIdRef.current) return;

        setGroups(res.data);
        setTotal(res.total);
        setPage(res.page);
        setPages(res.pages);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    },
    [q, category, discount, sort],
  );

  useEffect(() => {
    load(1);
  }, [load]);

  // Auto-refresh every 8s while sync is running to show live products.
  useEffect(() => {
    if (!isSyncing) return;
    const id = setInterval(() => load(page), 8000);
    return () => clearInterval(id);
  }, [isSyncing, load, page]);

  // Refresh products when enrichment finishes to show updated prices.
  const wasEnriching = useRef(false);
  useEffect(() => {
    if (wasEnriching.current && !isEnriching) load(page);
    wasEnriching.current = isEnriching;
  }, [isEnriching, load, page]);

  const interestIds = new Set(interests.map((i) => i.id));

  function handleAddToShopping(product: Product) {
    setFreqTarget(product);
  }

  async function confirmFreq(days: number) {
    if (!freqTarget) return;
    await onAddToShopping(freqTarget, days);
    setFreqTarget(null);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Banner sincronización en vivo */}
      {isSyncing &&
        syncStatus
          .filter((s) => s.status === 'running')
          .map((s) => {
            const pct =
              s.total_leaves > 0 ? Math.round((s.progress_leaf / s.total_leaves) * 100) : 0;
            return (
              <div
                key={s.super}
                className="mb-4 bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="animate-spin text-sm">⏳</span>
                  <span className="text-sm text-indigo-700 font-semibold">
                    Sincronizando {s.super.toUpperCase()}
                  </span>
                  <span className="ml-auto text-xs text-indigo-500 font-medium">
                    {s.progress_leaf}/{s.total_leaves} categorías ·{' '}
                    {s.product_count?.toLocaleString('es-AR') ?? '…'} productos
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
      {enrichEntries
        .filter(([key, s]) => s.running || enrichDoneKeys.includes(key))
        .map(([key, s]) => {
          const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
          if (s.running) {
            return (
              <div
                key={key}
                className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="animate-spin text-sm">✨</span>
                  <span className="text-sm text-amber-700 font-semibold">
                    Enriqueciendo precios de {key.toUpperCase()}
                  </span>
                  <span className="ml-auto text-xs text-amber-500 font-medium">
                    {s.done.toLocaleString('es-AR')}/{s.total.toLocaleString('es-AR')} · {s.updated}{' '}
                    con promo
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
          if (enrichDoneKeys.includes(key)) {
            return (
              <div
                key={key}
                className="mb-4 bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center gap-2"
              >
                <span className="text-green-600 text-sm">✅</span>
                <span className="text-sm text-green-700 font-semibold">
                  {key.toUpperCase()} enriquecido — {s.updated.toLocaleString('es-AR')} productos
                  con descuento real detectado
                </span>
              </div>
            );
          }
          return null;
        })}

      {/* Promo offers panel */}
      <PromoPanel offers={promos} />

      {/* Buscador */}
      <div className="relative mb-4">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">🔍</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar producto…"
          className="w-full pl-10 pr-4 py-3 rounded-2xl border border-gray-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 text-sm"
        />
      </div>

      {/* Categorías */}
      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
          <button
            type="button"
            onClick={() => setCategory('')}
            className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              !category
                ? 'bg-gray-800 text-white border-gray-800'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            Todo
          </button>
          {categories.map((cat) => (
            <button
              key={cat.slug}
              type="button"
              onClick={() => setCategory((c) => (c === cat.slug ? '' : cat.slug))}
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
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <button
          type="button"
          onClick={() => setDiscount((d) => !d)}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
            discount
              ? 'bg-red-500 text-white border-red-500'
              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          🔥 Con descuento
        </button>

        <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-500">
          <span className="hidden sm:inline">Ordenar:</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="text-xs font-semibold text-gray-700 px-3 py-1.5 rounded-full border border-gray-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 cursor-pointer"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Contador */}
      {!loading && (
        <p className="text-xs text-gray-400 mb-4">{total.toLocaleString('es-AR')} productos</p>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {SKELETON_KEYS.map((sk) => (
            <div
              key={sk}
              className="bg-white rounded-2xl h-64 animate-pulse border border-gray-100"
            />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-24 text-gray-400">
          <p className="text-4xl mb-3">🛒</p>
          <p className="font-medium">Sin resultados</p>
          <p className="text-sm mt-1">Probá otros filtros o sincronizá los precios primero</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {groups.map((g) => (
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
            type="button"
            disabled={page <= 1}
            onClick={() => load(page - 1)}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm disabled:opacity-40 hover:bg-gray-50"
          >
            ← Anterior
          </button>
          <span className="text-sm text-gray-500">
            {page} / {pages}
          </span>
          <button
            type="button"
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
