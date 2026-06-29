import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api } from './api';
import { CartDrawer } from './components/CartDrawer';
import { LocationSelector } from './components/LocationSelector';
import { CartProvider, useCart } from './contexts/CartContext';
import Cart from './pages/Cart';
import Compare from './pages/Compare';
import Explorar from './pages/Explorar';
import Intereses from './pages/Intereses';
import Onboarding from './pages/Onboarding';
import Planner from './pages/Planner';
import { FOCUS_RING } from './styles';
import type {
  EnrichStatus,
  Interest,
  Product,
  PromoOffer,
  ShoppingItem,
  SuperKey,
  SyncLog,
  UserProfile,
} from './types/api';

// ─── SyncPanel ────────────────────────────────────────────────────────────────

interface SyncPanelProps {
  status: SyncLog[];
  syncing: string;
  onSync: (key: SuperKey) => Promise<void>;
  onSyncAll: () => Promise<void>;
  capturingPromos: boolean;
  onCapturePromos: () => Promise<void>;
  locationSet: boolean;
}

function SyncPanel({
  status,
  syncing,
  onSync,
  onSyncAll,
  capturingPromos,
  onCapturePromos,
  locationSet,
}: SyncPanelProps) {
  const [open, setOpen] = useState(false);
  const SYNC_KEYS: SuperKey[] = ['vea', 'carrefour', 'dia', 'masonline'];
  const anyRunning = status.some((s) => s.status === 'running') || !!syncing;
  // Sync is a test-only manual trigger; require a location so it crawls the
  // user's region instead of pulling every region's prices.
  const blocked = anyRunning || !locationSet;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`text-xs font-medium px-3 py-1.5 rounded-xl border transition-colors ${
          anyRunning
            ? 'border-indigo-300 bg-indigo-50 text-indigo-600 animate-pulse'
            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}
      >
        {anyRunning ? '⏳ Sincronizando…' : '⚡ Sync'}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 p-3 w-72 z-50">
          <p className="text-xs font-semibold text-gray-500 mb-3 px-1">Sincronizar precios</p>

          {!locationSet && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-1.5 mb-3 leading-snug">
              📍 Cargá tu ubicación antes de sincronizar — el sync trae precios de tu zona.
            </p>
          )}

          <button
            type="button"
            onClick={() => {
              onSyncAll();
              setOpen(false);
            }}
            disabled={blocked}
            className="w-full mb-3 text-xs font-medium px-3 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {anyRunning ? 'Sincronizando…' : '⚡ Sincronizar todos'}
          </button>

          {SYNC_KEYS.map((key) => {
            const s = status.find((x) => x.super === key);
            const isRunning = syncing === key || s?.status === 'running';
            const pct =
              s && s.total_leaves > 0 ? Math.round((s.progress_leaf / s.total_leaves) * 100) : null;

            return (
              <div key={key} className="py-2 px-1 border-b border-gray-50 last:border-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-700 uppercase">{key}</span>
                  <button
                    type="button"
                    onClick={() => {
                      onSync(key);
                      setOpen(false);
                    }}
                    disabled={blocked}
                    className="text-xs px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-40 font-medium"
                  >
                    {isRunning ? 'Corriendo' : 'Sync'}
                  </button>
                </div>

                {/* Info / progress bar */}
                {s?.status === 'running' && s.total_leaves > 0 && (
                  <div className="mt-1">
                    <div className="flex justify-between text-xs text-gray-400 mb-0.5">
                      <span>
                        {s.progress_leaf}/{s.total_leaves} hojas
                      </span>
                      <span>{pct}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className="bg-indigo-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )}
                {s?.status === 'running' && !s.total_leaves && (
                  <p className="text-xs text-indigo-500">Obteniendo categorías…</p>
                )}
                {s?.status === 'ok' && (
                  <p className="text-xs text-green-600">
                    ✓ {s.product_count?.toLocaleString('es-AR')} productos ·{' '}
                    {s.finished_at?.slice(0, 10)}
                  </p>
                )}
                {s?.status === 'error' && (
                  <p className="text-xs text-red-500">✕ {s.error?.slice(0, 40)}</p>
                )}
              </div>
            );
          })}

          {/* Bank promos */}
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 mb-2 px-1">Promos bancarias</p>
            <button
              type="button"
              onClick={() => onCapturePromos()}
              disabled={capturingPromos}
              className="w-full text-xs font-medium px-3 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {capturingPromos ? 'Recolectando promos…' : '🏦 Actualizar promos bancarias'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AppShell — rendered inside CartProvider so useCart() is available ────────

function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { itemCount, openCart } = useCart();
  const [interests, setInterests] = useState<Interest[]>([]);
  const [shopping, setShopping] = useState<ShoppingItem[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncLog[]>([]);
  const [syncing, setSyncing] = useState('');
  const [enrichStatus, setEnrichStatus] = useState<Record<string, EnrichStatus>>({});
  // Supers seen running this session, and those that completed this session.
  // The success banner is transient: it shows only on an observed running→done
  // transition (never from stale backend status on a fresh load) and auto-hides.
  const enrichSeenRunning = useRef<Set<string>>(new Set());
  const [enrichDone, setEnrichDone] = useState<string[]>([]);

  const applyEnrichStatus = useCallback((fresh: Record<string, EnrichStatus>) => {
    setEnrichStatus(fresh);
    for (const [key, s] of Object.entries(fresh)) {
      if (s.running) {
        enrichSeenRunning.current.add(key);
      } else if (enrichSeenRunning.current.has(key) && s.updated > 0) {
        enrichSeenRunning.current.delete(key);
        setEnrichDone((d) => (d.includes(key) ? d : [...d, key]));
        setTimeout(() => setEnrichDone((d) => d.filter((k) => k !== key)), 8000);
      }
    }
  }, []);
  const [promos, setPromos] = useState<PromoOffer[]>([]);
  const [capturingPromos, setCapturingPromos] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined);

  // Remember the last Explorar URL (incl. its search/filter query string) so
  // switching tabs and coming back restores the search instead of resetting to
  // a bare "/". A ref avoids re-rendering the shell on every keystroke.
  const explorarTo = useRef('/');
  useEffect(() => {
    if (location.pathname === '/') {
      explorarTo.current = location.pathname + location.search;
    }
  }, [location]);

  // Runs once on mount to load data and redirect to onboarding if needed.
  // Deps are intentionally empty: adding location.pathname/navigate would re-run
  // this on every navigation, causing an infinite redirect loop.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional once-on-mount effect (see above)
  useEffect(() => {
    api.interests.list().then(setInterests).catch(console.error);
    api.shopping.list().then(setShopping).catch(console.error);
    api.sync.status().then(setSyncStatus).catch(console.error);
    api.enrich.status().then(applyEnrichStatus).catch(console.error);
    api.promos.list().then(setPromos).catch(console.error);
    api.profile.get().then((p) => {
      setProfile(p);
      // Onboarding is an optional welcome: redirect new users to it once so they
      // can discover it, but skip the redirect if they already opted out (the
      // "Saltar por ahora" button persists this flag locally).
      const skipped = localStorage.getItem('onboarding_skipped') === '1';
      if (!p?.onboarding_done && !skipped && location.pathname !== '/onboarding') {
        navigate('/onboarding', { replace: true });
      }
    });
  }, []);

  // Auto-poll while a sync is running.
  useEffect(() => {
    const hasRunning = syncStatus.some((s) => s.status === 'running') || !!syncing;
    if (!hasRunning) return;
    const id = setInterval(async () => {
      const fresh = await api.sync.status().catch(() => null);
      if (!fresh) return;
      setSyncStatus(fresh);
      if (!fresh.some((s) => s.status === 'running')) {
        setSyncing('');
      }
    }, 3000);
    return () => clearInterval(id);
  }, [syncStatus, syncing]);

  // Auto-poll while enrichment is running.
  useEffect(() => {
    const anyEnriching = Object.values(enrichStatus).some((s) => s.running);
    if (!anyEnriching) return;
    const id = setInterval(async () => {
      const fresh = await api.enrich.status().catch(() => null);
      if (fresh) applyEnrichStatus(fresh);
    }, 3000);
    return () => clearInterval(id);
  }, [enrichStatus, applyEnrichStatus]);

  async function toggleInterest(product: Product) {
    const existing = interests.find((i) => i.id === product.id);
    if (existing) {
      await api.interests.remove(existing.interest_id);
      setInterests((prev) => prev.filter((i) => i.interest_id !== existing.interest_id));
    } else {
      await api.interests.add(product.id);
      // Reload to get the full Interest object with interest_id.
      const fresh = await api.interests.list();
      setInterests(fresh);
    }
  }

  async function addToShopping(product: Product, frequency_days: number) {
    await api.shopping.add({ product_id: product.id, frequency_days });
    const fresh = await api.shopping.list();
    setShopping(fresh);
  }

  async function triggerSync(superKey: SuperKey) {
    setSyncing(superKey);
    try {
      await api.sync.trigger(superKey);
      const fresh = await api.sync.status();
      setSyncStatus(fresh);
    } catch {
      setSyncing('');
    }
  }

  async function triggerSyncAll() {
    setSyncing('all');
    try {
      await api.sync.triggerAll();
      const fresh = await api.sync.status();
      setSyncStatus(fresh);
    } catch {
      setSyncing('');
    }
  }

  // Capture is fire-and-forget (Playwright renders 4 sites, ~30-60s) with no
  // status endpoint, so we poll GET /promos for a bounded window and refresh
  // the panel as offers land, then stop.
  async function triggerCapturePromos() {
    if (capturingPromos) return;
    setCapturingPromos(true);
    try {
      await api.promos.capture();
    } catch {
      setCapturingPromos(false);
      return;
    }
    let tries = 0;
    const id = setInterval(async () => {
      tries += 1;
      const fresh = await api.promos.list().catch(() => null);
      if (fresh) setPromos(fresh);
      if (tries >= 20) {
        clearInterval(id);
        setCapturingPromos(false);
      }
    }, 4000);
  }

  const shoppingIds = new Set(shopping.map((s) => s.id));

  const cartLabel = itemCount > 0 ? `Carrito (${itemCount})` : 'Carrito';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Navbar */}
      <nav
        aria-label="Principal"
        className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-40"
      >
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16 flex items-center h-14 gap-3 sm:gap-6">
          <span className="font-bold text-gray-900 text-base tracking-tight flex-shrink-0">
            🛒 COMPRO
          </span>

          {/* Primary nav: inline on lg+. On smaller screens it moves to a bottom
              tab bar (see BottomNav) so the top bar never overflows the viewport. */}
          <div className="hidden lg:flex gap-1 flex-1">
            {[
              { id: 'explorar', to: explorarTo.current, label: 'Explorar', end: true },
              {
                id: 'intereses',
                to: '/intereses',
                label: `Intereses ${interests.length ? `(${interests.length})` : ''}`,
                end: false,
              },
              {
                id: 'planner',
                to: '/planner',
                label: `Planner ${shopping.length ? `(${shopping.length})` : ''}`,
                end: false,
              },
            ]
              .concat(
                profile?.onboarding_done
                  ? [{ id: 'compare', to: '/compare', label: '📊 Comparar', end: false }]
                  : [],
              )
              .map(({ id, to, label, end }) => (
                <NavLink
                  key={id}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `flex-shrink-0 text-sm font-medium px-3 py-1.5 rounded-xl transition-colors ${FOCUS_RING} ${
                      isActive
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                    }`
                  }
                >
                  {label}
                </NavLink>
              ))}
          </div>

          {/* Spacer pushes the right-side controls to the edge on mobile, where the
              inline nav links are hidden (they live in the bottom tab bar instead). */}
          <div className="flex-1 lg:hidden" aria-hidden="true" />

          {/* Cart — opens the cart drawer */}
          <button
            type="button"
            aria-label={cartLabel}
            onClick={openCart}
            className={`relative inline-flex items-center justify-center w-9 h-9 rounded-xl transition-colors ${FOCUS_RING} text-gray-500 hover:text-gray-800 hover:bg-gray-50`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.8}
              stroke="currentColor"
              className="w-5 h-5"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
              />
            </svg>
            {itemCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
                {itemCount}
              </span>
            )}
          </button>

          {/* Location selector */}
          <LocationSelector
            location={profile?.postal_code ?? null}
            onSaved={(p) => setProfile(p)}
          />

          {/* Sync panel */}
          <SyncPanel
            status={syncStatus}
            syncing={syncing}
            onSync={triggerSync}
            onSyncAll={triggerSyncAll}
            capturingPromos={capturingPromos}
            onCapturePromos={triggerCapturePromos}
            locationSet={!!profile?.postal_code}
          />
        </div>
      </nav>

      {/* Content — bottom padding on mobile clears the fixed bottom tab bar */}
      <main className="flex-1 pb-16 lg:pb-0">
        <Routes>
          <Route
            path="/"
            element={
              <Explorar
                interests={interests}
                onToggleInterest={toggleInterest}
                onAddToShopping={addToShopping}
                syncStatus={syncStatus}
                enrichStatus={enrichStatus}
                enrichDoneKeys={enrichDone}
                promos={promos}
              />
            }
          />
          <Route
            path="/intereses"
            element={
              <Intereses
                interests={interests}
                onToggleInterest={toggleInterest}
                onAddToShopping={addToShopping}
                shoppingIds={shoppingIds}
              />
            }
          />
          <Route path="/planner" element={<Planner />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/compare" element={<Compare />} />
          <Route
            path="/onboarding"
            element={
              <Onboarding
                onComplete={(p) => {
                  setProfile(p);
                  navigate('/planner', { replace: true });
                }}
              />
            }
          />
        </Routes>
      </main>

      {/* Cart drawer — overlays all routes */}
      <CartDrawer />

      {/* Bottom tab bar — primary navigation on small screens (the inline top-bar
          links are hidden < lg). Keeps the top bar from overflowing the viewport. */}
      <nav
        aria-label="Navegación inferior"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-100"
      >
        <div className="flex items-stretch">
          {[
            { id: 'explorar', to: explorarTo.current, label: 'Explorar', icon: '🔍', end: true },
            { id: 'intereses', to: '/intereses', label: 'Intereses', icon: '❤️', end: false },
            { id: 'planner', to: '/planner', label: 'Planner', icon: '📋', end: false },
          ]
            .concat(
              profile?.onboarding_done
                ? [{ id: 'compare', to: '/compare', label: 'Comparar', icon: '📊', end: false }]
                : [],
            )
            .map(({ id, to, label, icon, end }) => (
              <NavLink
                key={id}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${FOCUS_RING} ${
                    isActive ? 'text-indigo-700' : 'text-gray-500'
                  }`
                }
              >
                <span className="text-lg leading-none" aria-hidden="true">
                  {icon}
                </span>
                {label}
              </NavLink>
            ))}
        </div>
      </nav>
    </div>
  );
}

// ─── App — provides CartContext, then renders AppShell inside it ──────────────

export default function App() {
  return (
    <CartProvider>
      <AppShell />
    </CartProvider>
  );
}
