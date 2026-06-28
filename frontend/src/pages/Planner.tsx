import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { EmptyState } from '../components/EmptyState';
import RecommendationBanner from '../components/RecommendationBanner';
import { PageContainer } from '../components/layout/PageContainer';
import { FOCUS_RING, PRIMARY_CTA } from '../styles';
import { CATEGORY_LABEL, FREQ_OPTIONS, pesos, superCfg } from '../supers';
import type { Product, ShoppingItem, WeeklyGroup } from '../types/api';

// ─── Category metadata ────────────────────────────────────────────────────────

function catMeta(key: string | null) {
  if (!key) return { label: 'Otros', icon: '📦' };
  return CATEGORY_LABEL[key] ?? { label: key, icon: '📦' };
}

// ─── SwapModal ────────────────────────────────────────────────────────────────

interface SwapModalProps {
  item: ShoppingItem;
  onSwap: (shoppingId: number, newProductId: number) => Promise<void>;
  onClose: () => void;
}

function SwapModal({ item, onSwap, onClose }: SwapModalProps) {
  const initialQ = item.notes?.split(' ')[0] ?? item.name.split(' ')[0] ?? '';
  const [q, setQ] = useState(initialQ);
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [swapping, setSwapping] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        // available=1 filters to products with a known price (i.e. raw_price IS NOT NULL).
        // category_key narrows results to the same taxonomy category as the item being swapped.
        const params: Record<string, string> = { limit: '20', available: '1' };
        if (item.category_key) params.category_key = item.category_key;
        if (q.trim()) params.q = q.trim();
        const res = await api.products.list(params);
        setResults(res.data.filter((p) => p.id !== item.id));
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q, item.category_key, item.id]);

  async function handleSwap(product: Product) {
    setSwapping(product.id);
    try {
      await onSwap(item.shopping_id, product.id);
      onClose();
    } finally {
      setSwapping(null);
    }
  }

  const meta = catMeta(item.category_key);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wide mb-0.5">
              {meta.icon} {meta.label} — Reemplazar producto
            </p>
            <p className="text-sm text-gray-500 truncate">{item.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none flex-shrink-0 mt-0.5"
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-gray-100">
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar producto…"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1 px-4 py-2">
          {loading && <p className="text-center text-sm text-gray-400 py-6">Buscando…</p>}
          {!loading && results.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-6">Sin resultados</p>
          )}
          {!loading &&
            results.map((p) => {
              const price = p.offer_price ?? p.raw_price;
              const cfg = superCfg(p.super);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSwap(p)}
                  disabled={swapping === p.id}
                  className="w-full flex items-center gap-3 py-2.5 border-b border-gray-50 hover:bg-indigo-50 rounded-xl px-2 transition-colors text-left disabled:opacity-50"
                >
                  <div className="w-10 h-10 flex-shrink-0 rounded-lg bg-gray-50 flex items-center justify-center overflow-hidden">
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt={p.name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="text-gray-200 text-sm">🛒</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate leading-snug">{p.name}</p>
                    <span
                      className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}
                    >
                      {cfg.label}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 flex-shrink-0">
                    {pesos(price)}
                  </span>
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}

// ─── CategoryNav (lg+ sidebar) ────────────────────────────────────────────────

interface CategoryNavProps {
  groups: Array<{ catKey: string | null; meta: { label: string; icon: string }; count: number }>;
}

function CategoryNav({ groups }: CategoryNavProps) {
  return (
    <nav aria-label="Categorías de la lista" className="flex flex-col gap-1">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-2">
        Categorías
      </p>
      {groups.map(({ catKey, meta, count }) => {
        const id = `cat-${catKey ?? 'otros'}`;
        return (
          <a
            key={catKey ?? 'otros'}
            href={`#${id}`}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-xl text-sm text-gray-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors ${FOCUS_RING}`}
          >
            <span className="text-base leading-none">{meta.icon}</span>
            <span className="flex-1 truncate font-medium">{meta.label}</span>
            <span className="text-xs text-gray-400 tabular-nums">{count}</span>
          </a>
        );
      })}
    </nav>
  );
}

// ─── ListTab ──────────────────────────────────────────────────────────────────

export interface ListTabProps {
  list: ShoppingItem[];
  onMarkBought: (item: ShoppingItem) => Promise<void>;
  onChangeFreq: (item: ShoppingItem, days: string) => Promise<void>;
  onRemove: (item: ShoppingItem) => Promise<void>;
  onSwap: (shoppingId: number, newProductId: number) => Promise<void>;
}

function isDue(item: Pick<ShoppingItem, 'last_bought' | 'frequency_days'>): boolean {
  if (!item.last_bought) return true;
  const last = new Date(item.last_bought);
  const now = new Date();
  const diff = (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= item.frequency_days;
}

function ListTab({ list, onMarkBought, onChangeFreq, onRemove, onSwap }: ListTabProps) {
  const [swapItem, setSwapItem] = useState<ShoppingItem | null>(null);

  if (list.length === 0) {
    return (
      <EmptyState
        icon="📋"
        title="La lista está vacía"
        description='Desde "Mis Intereses" agregá productos con su frecuencia de compra'
        action={
          <Link to="/intereses" className={`${PRIMARY_CTA} ${FOCUS_RING}`}>
            Ir a Intereses
          </Link>
        }
      />
    );
  }

  // Group by category_key preserving insertion order
  const groups = new Map<string | null, ShoppingItem[]>();
  for (const item of list) {
    const key = item.category_key ?? null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  // Build nav group metadata for the sticky sidebar
  const navGroups = Array.from(groups.entries()).map(([catKey, items]) => ({
    catKey,
    meta: catMeta(catKey),
    count: items.length,
  }));

  const groupedList = (
    <div className="flex flex-col gap-6">
      {Array.from(groups.entries()).map(([catKey, items]) => {
        const meta = catMeta(catKey);
        const sectionId = `cat-${catKey ?? 'otros'}`;
        return (
          <div key={catKey ?? 'otros'} id={sectionId}>
            {/* Category header */}
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="text-base">{meta.icon}</span>
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                {meta.label}
              </span>
              <span className="text-xs text-gray-300">({items.length})</span>
            </div>

            <div className="flex flex-col gap-2">
              {items.map((item) => {
                const cfg = superCfg(item.super);
                const price = item.offer_price ?? item.raw_price;
                const due = isDue(item);

                return (
                  <div
                    key={item.shopping_id}
                    className={`bg-white rounded-2xl border shadow-sm p-3 flex items-center gap-3 ${due ? 'border-indigo-200' : 'border-gray-100'}`}
                  >
                    {/* Img */}
                    <div className="w-12 h-12 flex-shrink-0 rounded-xl bg-gray-50 flex items-center justify-center overflow-hidden">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="text-xl text-gray-200">🛒</span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span
                          className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}
                        >
                          {cfg.label}
                        </span>
                        {due && (
                          <span className="text-xs text-indigo-600 font-semibold">
                            ● Toca comprar
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-gray-500">{pesos(price)}</span>
                        <span className="text-xs text-gray-400">
                          {item.last_bought ? `Último: ${item.last_bought}` : 'Nunca comprado'}
                        </span>
                        {item.notes && <span className="text-xs text-gray-400">{item.notes}</span>}
                      </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <select
                        value={item.frequency_days}
                        onChange={(e) => onChangeFreq(item, e.target.value)}
                        className="text-xs py-1 px-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-600 focus:outline-none"
                      >
                        {FREQ_OPTIONS.map((o) => (
                          <option key={o.days} value={o.days}>
                            {o.label}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => setSwapItem(item)}
                        aria-label="Reemplazar por otro producto"
                        title="Reemplazar por otro producto"
                        className={`text-xs px-2.5 py-1.5 rounded-xl bg-indigo-50 text-indigo-500 border border-indigo-200 hover:bg-indigo-100 font-medium ${FOCUS_RING}`}
                      >
                        ⇄
                      </button>

                      <button
                        type="button"
                        onClick={() => onMarkBought(item)}
                        aria-label="Marcar como comprado hoy"
                        title="Marcar como comprado hoy"
                        className={`text-xs px-2.5 py-1.5 rounded-xl bg-green-50 text-green-600 border border-green-200 hover:bg-green-100 font-medium ${FOCUS_RING}`}
                      >
                        ✓
                      </button>

                      <button
                        type="button"
                        onClick={() => onRemove(item)}
                        aria-label="Quitar de la lista"
                        title="Quitar de la lista"
                        className={`text-xs px-2.5 py-1.5 rounded-xl bg-gray-50 text-gray-400 border border-gray-200 hover:bg-red-50 hover:text-red-400 hover:border-red-200 ${FOCUS_RING}`}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      {/* lg+: two-column layout — sticky category nav on the left */}
      <div className="lg:grid lg:grid-cols-[13rem_1fr] lg:gap-6">
        {/* Category nav — hidden on mobile, sticky on lg+ */}
        <aside className="hidden lg:block">
          <div className="lg:sticky lg:top-[4.5rem] lg:self-start">
            <CategoryNav groups={navGroups} />
          </div>
        </aside>

        {/* Grouped list — full width on mobile, right column on lg+ */}
        <div>{groupedList}</div>
      </div>

      {swapItem && <SwapModal item={swapItem} onSwap={onSwap} onClose={() => setSwapItem(null)} />}
    </>
  );
}

// ─── WeeklyTab ────────────────────────────────────────────────────────────────

export interface WeeklyTabProps {
  groups: WeeklyGroup[];
  total: number;
  onMarkBought: (item: ShoppingItem) => Promise<void>;
}

function WeeklyTab({ groups, total, onMarkBought }: WeeklyTabProps) {
  if (groups.length === 0) {
    return (
      <EmptyState
        icon="✅"
        title="Todo al día"
        description="No hay productos que comprar esta semana"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3 flex justify-between items-center">
        <span className="text-sm font-medium text-indigo-700">Total estimado esta semana</span>
        <span className="text-lg font-bold text-indigo-900">{pesos(total)}</span>
      </div>

      {groups.map((group) => {
        const cfg = superCfg(group.super);
        return (
          <div
            key={group.super}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
          >
            <div className={`px-4 py-2.5 flex justify-between items-center ${cfg.bg}`}>
              <span className={`font-bold text-sm ${cfg.text}`}>{cfg.label}</span>
              <span className={`text-sm font-semibold ${cfg.text} opacity-90`}>
                {pesos(group.total)}
              </span>
            </div>
            <div className="divide-y divide-gray-50">
              {group.items.map((item) => {
                const price = item.offer_price ?? item.raw_price;
                return (
                  <div key={item.shopping_id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="w-9 h-9 flex-shrink-0 rounded-lg bg-gray-50 flex items-center justify-center overflow-hidden">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="text-sm text-gray-200">🛒</span>
                      )}
                    </div>
                    <p className="flex-1 text-sm text-gray-800 truncate">{item.name}</p>
                    <span className="text-sm font-semibold text-gray-900 flex-shrink-0">
                      {pesos(price)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onMarkBought(item)}
                      title="Marcar como comprado"
                      className="text-xs px-2 py-1 rounded-lg bg-green-50 text-green-600 border border-green-200 hover:bg-green-100 flex-shrink-0"
                    >
                      ✓
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function PlannerSkeleton() {
  return (
    <PageContainer>
      <div className="animate-pulse space-y-4">
        {/* Tab bar placeholder */}
        <div className="flex gap-2">
          <div className="h-9 w-28 rounded-2xl bg-gray-200" />
          <div className="h-9 w-36 rounded-2xl bg-gray-100" />
        </div>
        {/* Item rows placeholder */}
        {[...Array(4)].map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder has no stable key
          <div
            key={i}
            className="bg-white rounded-2xl border border-gray-100 p-3 flex items-center gap-3 shadow-sm"
          >
            <div className="w-12 h-12 rounded-xl bg-gray-200 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/4 rounded bg-gray-200" />
              <div className="h-3 w-3/4 rounded bg-gray-200" />
              <div className="h-3 w-1/3 rounded bg-gray-100" />
            </div>
            <div className="flex gap-1.5 flex-shrink-0">
              <div className="h-7 w-8 rounded-xl bg-gray-100" />
              <div className="h-7 w-8 rounded-xl bg-gray-100" />
              <div className="h-7 w-8 rounded-xl bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </PageContainer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Planner() {
  const [list, setList] = useState<ShoppingItem[]>([]);
  const [weekly, setWeekly] = useState<WeeklyGroup[]>([]);
  const [tab, setTab] = useState<'list' | 'weekly'>('list');
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [l, w] = await Promise.all([api.shopping.list(), api.shopping.weekly()]);
      setList(l);
      setWeekly(w);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function markBought(item: ShoppingItem) {
    const today = new Date().toISOString().slice(0, 10);
    await api.shopping.update(item.shopping_id, { last_bought: today });
    await loadAll();
  }

  async function changeFreq(item: ShoppingItem, days: string) {
    await api.shopping.update(item.shopping_id, { frequency_days: Number(days) });
    await loadAll();
  }

  async function removeItem(item: ShoppingItem) {
    await api.shopping.remove(item.shopping_id);
    await loadAll();
  }

  async function swapItem(shoppingId: number, newProductId: number) {
    await api.shopping.update(shoppingId, { product_id: newProductId });
    await loadAll();
  }

  const totalWeekly = weekly.reduce((acc, g) => acc + (g.total ?? 0), 0);

  if (loading) {
    return <PlannerSkeleton />;
  }

  return (
    <PageContainer>
      <h1 className="sr-only">Planner de compras</h1>
      <RecommendationBanner />

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl">
          {[
            { id: 'list' as const, label: '📋 Mi lista' },
            {
              id: 'weekly' as const,
              label: `🛒 Esta semana (${weekly.reduce((a, g) => a + g.items.length, 0)})`,
            },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`text-sm font-semibold px-4 py-2 rounded-xl transition-colors ${
                tab === t.id
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <Link
          to="/compare"
          className="ml-auto text-xs font-semibold px-3 py-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100 transition-colors"
        >
          📊 Comparar supers
        </Link>
      </div>

      {tab === 'list' && (
        <ListTab
          list={list}
          onMarkBought={markBought}
          onChangeFreq={changeFreq}
          onRemove={removeItem}
          onSwap={swapItem}
        />
      )}
      {tab === 'weekly' && (
        <WeeklyTab groups={weekly} total={totalWeekly} onMarkBought={markBought} />
      )}
    </PageContainer>
  );
}
