import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { EmptyState } from '../../../host/ui/EmptyState';
import FreqModal from '../components/FreqModal';
import GroupedCard from '../components/GroupedCard';
import PromoPanel from '../components/PromoPanel';
import { PageContainer } from '../../../host/ui/layout/PageContainer';
import { FOCUS_RING, FOCUS_RING_INPUT, PRIMARY_CTA } from '../../../host/ui/styles';
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

// ─── FilterSidebar ────────────────────────────────────────────────────────────
// Module-level so React never unmounts/remounts it on Explorar re-renders.

interface FilterSidebarProps {
  categories: TaxonomyEntry[];
  category: string;
  onSelectCategory: (slug: string) => void;
  discount: boolean;
  onToggleDiscount: () => void;
  sort: SortKey;
  onChangeSort: (s: SortKey) => void;
}

/** Desktop sidebar: vertical category list + filter controls. Hidden on <lg. */
function FilterSidebar({
  categories,
  category,
  onSelectCategory,
  discount,
  onToggleDiscount,
  sort,
  onChangeSort,
}: FilterSidebarProps) {
  return (
    <aside aria-label="Filtros" className="hidden lg:block lg:self-start">
      {/* Sticky wrapper — sticks to viewport as the grid scrolls. */}
      <div className="lg:sticky lg:top-[4.5rem] space-y-6">
        {/* Categorías section */}
        <section aria-labelledby="sidebar-cats-heading">
          <h2
            id="sidebar-cats-heading"
            className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2"
          >
            Categorías
          </h2>
          <ul className="space-y-0.5">
            <li>
              <button
                type="button"
                onClick={() => onSelectCategory('')}
                className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-colors ${FOCUS_RING} ${
                  !category ? 'bg-gray-800 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Todo
              </button>
            </li>
            {categories.map((cat) => (
              <li key={cat.slug}>
                <button
                  type="button"
                  onClick={() => onSelectCategory(cat.slug)}
                  className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${FOCUS_RING} ${
                    category === cat.slug
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <span aria-hidden="true">{cat.icon}</span>
                  <span>{cat.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Filtros section */}
        <section aria-labelledby="sidebar-filters-heading">
          <h2
            id="sidebar-filters-heading"
            className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2"
          >
            Filtros
          </h2>
          <div className="space-y-4">
            {/* Discount toggle */}
            <button
              type="button"
              onClick={onToggleDiscount}
              className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-colors ${FOCUS_RING} ${
                discount ? 'bg-red-500 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              🔥 Con descuento
            </button>

            {/* Sort */}
            <div>
              <label htmlFor="sidebar-sort" className="block text-xs text-gray-500 mb-1.5">
                Ordenar
              </label>
              <select
                id="sidebar-sort"
                value={sort}
                onChange={(e) => onChangeSort(e.target.value as SortKey)}
                className={`w-full text-sm font-medium text-gray-700 px-3 py-2 rounded-xl border border-gray-200 bg-white shadow-sm cursor-pointer ${FOCUS_RING_INPUT}`}
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>
      </div>
    </aside>
  );
}

const SORT_OPTIONS: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: 'relevance', label: 'Relevancia' },
  { value: 'price_asc', label: 'Precio: menor a mayor' },
  { value: 'price_desc', label: 'Precio: mayor a menor' },
  { value: 'discount_desc', label: 'Mayor descuento' },
];

/**
 * Grid column classes shared by the skeleton and the real grid.
 * Mobile/sm: fixed 2–3 columns. lg+: fluid auto-fill so the grid fills the full
 * viewport width with comfortably-sized cards (more columns on wider screens)
 * instead of a fixed column count that leaves dead horizontal space.
 */
const GRID_COLS = 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]';

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
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<TaxonomyEntry[]>([]);

  // URL is the single source of truth for the search/filter state. This makes
  // every search shareable (deep-linkable) and restores it on back/forward with
  // no extra store. The text input keeps a local mirror (qInput) so typing stays
  // snappy while we debounce writes into the URL.
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const category = searchParams.get('cat') ?? '';
  const discount = searchParams.get('discount') === '1';
  const sort = (searchParams.get('sort') as SortKey) || 'relevance';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  const [qInput, setQInput] = useState(q);

  // Patch a subset of params; empty/null values are removed to keep URLs clean.
  const update = useCallback(
    (patch: Record<string, string | null>, opts?: { replace?: boolean }) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v == null || v === '') next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: opts?.replace },
      );
    },
    [setSearchParams],
  );

  const [freqTarget, setFreqTarget] = useState<Product | null>(null);

  useEffect(() => {
    api.products.categories().then(setCategories).catch(console.error);
  }, []);

  // Reflect external URL changes (back/forward, deep link) into the input.
  useEffect(() => {
    setQInput(q);
  }, [q]);

  // Debounce input → URL so we don't push a history entry per keystroke. A new
  // search resets pagination; replace keeps back/forward clean of typing noise.
  useEffect(() => {
    if (qInput === q) return;
    const id = setTimeout(() => {
      update({ q: qInput || null, page: null }, { replace: true });
    }, 300);
    return () => clearTimeout(id);
  }, [qInput, q, update]);

  const isSyncing = syncStatus.some((s) => s.status === 'running');
  const isEnriching = Object.values(enrichStatus).some((s) => s.running);
  const enrichEntries = Object.entries(enrichStatus);

  const reqIdRef = useRef(0);

  const load = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setGroups([]);
    try {
      const params: Record<string, string> = {
        page: String(page),
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
      setPages(res.pages);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [q, category, discount, sort, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh every 8s while sync is running to show live products.
  useEffect(() => {
    if (!isSyncing) return;
    const id = setInterval(() => load(), 8000);
    return () => clearInterval(id);
  }, [isSyncing, load]);

  // Refresh products when enrichment finishes to show updated prices.
  const wasEnriching = useRef(false);
  useEffect(() => {
    if (wasEnriching.current && !isEnriching) load();
    wasEnriching.current = isEnriching;
  }, [isEnriching, load]);

  const interestIds = new Set(interests.map((i) => i.id));

  function handleAddToShopping(product: Product) {
    setFreqTarget(product);
  }

  async function confirmFreq(days: number) {
    if (!freqTarget) return;
    await onAddToShopping(freqTarget, days);
    setFreqTarget(null);
  }

  /** True when any filter is active (so the EmptyState can offer a reset). */
  const hasActiveFilters = Boolean(q || category || discount);

  function clearFilters() {
    setQInput('');
    update({ q: null, cat: null, discount: null, page: null });
  }

  return (
    <PageContainer>
      <h1 className="sr-only">Explorar productos</h1>

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

      {/* Buscador — always visible at all breakpoints */}
      <div className="relative mb-4">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">🔍</span>
        <input
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="Buscar producto…"
          className={`w-full pl-10 pr-4 py-3 rounded-2xl border border-gray-200 bg-white shadow-sm text-sm ${FOCUS_RING_INPUT}`}
        />
      </div>

      {/* ── Mobile-only: horizontal category chips + filter row (<lg) ───────── */}
      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide -mx-4 px-4 sm:-mx-6 sm:px-6 lg:hidden">
          <button
            type="button"
            onClick={() => update({ cat: null, page: null })}
            className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${FOCUS_RING} ${
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
              onClick={() =>
                update({ cat: category === cat.slug ? null : cat.slug, page: null })
              }
              className={`flex-shrink-0 flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${FOCUS_RING} ${
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

      {/* Mobile-only filter row (<lg) */}
      <div className="flex flex-wrap items-center gap-2 mb-6 lg:hidden">
        <button
          type="button"
          onClick={() => update({ discount: discount ? null : '1', page: null })}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${FOCUS_RING} ${
            discount
              ? 'bg-red-500 text-white border-red-500'
              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          🔥 Con descuento
        </button>

        <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-500">
          <span className="sr-only sm:not-sr-only">Ordenar:</span>
          <select
            value={sort}
            onChange={(e) =>
              update({ sort: e.target.value === 'relevance' ? null : e.target.value, page: null })
            }
            className={`text-xs font-semibold text-gray-700 px-3 py-1.5 rounded-full border border-gray-200 bg-white shadow-sm cursor-pointer ${FOCUS_RING_INPUT}`}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* ── Two-column layout on lg+: [sidebar | grid] ───────────────────────── */}
      <div className="lg:grid lg:grid-cols-[13rem_1fr] lg:gap-6">
        {/* Left sidebar — desktop only */}
        <FilterSidebar
          categories={categories}
          category={category}
          onSelectCategory={(slug) =>
            update({ cat: category === slug ? null : slug || null, page: null })
          }
          discount={discount}
          onToggleDiscount={() => update({ discount: discount ? null : '1', page: null })}
          sort={sort}
          onChangeSort={(s) => update({ sort: s === 'relevance' ? null : s, page: null })}
        />

        {/* Main content column */}
        <div className="min-w-0">
          {/* Contador */}
          {!loading && (
            <p className="text-xs text-gray-400 mb-4">{total.toLocaleString('es-AR')} productos</p>
          )}

          {/* Grid */}
          {loading ? (
            <div className={`grid ${GRID_COLS} gap-3`}>
              {SKELETON_KEYS.map((sk) => (
                <div
                  key={sk}
                  className="bg-white rounded-2xl h-64 animate-pulse border border-gray-100"
                />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <EmptyState
              icon="🛒"
              title="Sin resultados"
              description="Probá otros filtros o sincronizá los precios primero"
              action={
                hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className={`${PRIMARY_CTA} ${FOCUS_RING}`}
                  >
                    Limpiar filtros
                  </button>
                ) : undefined
              }
            />
          ) : (
            <div className={`grid ${GRID_COLS} gap-3`}>
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
                onClick={() => update({ page: page - 1 <= 1 ? null : String(page - 1) })}
                className={`px-4 py-2 rounded-xl border border-gray-200 text-sm disabled:opacity-40 hover:bg-gray-50 ${FOCUS_RING}`}
              >
                ← Anterior
              </button>
              <span className="text-sm text-gray-500">
                {page} / {pages}
              </span>
              <button
                type="button"
                disabled={page >= pages}
                onClick={() => update({ page: String(page + 1) })}
                className={`px-4 py-2 rounded-xl border border-gray-200 text-sm disabled:opacity-40 hover:bg-gray-50 ${FOCUS_RING}`}
              >
                Siguiente →
              </button>
            </div>
          )}
        </div>
      </div>

      {freqTarget && (
        <FreqModal
          product={freqTarget}
          onConfirm={confirmFreq}
          onClose={() => setFreqTarget(null)}
        />
      )}
    </PageContainer>
  );
}
