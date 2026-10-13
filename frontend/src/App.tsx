import {
  RedirectToSignIn,
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
  useAuth,
} from '@clerk/clerk-react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api } from './modules/comparador/api';
import { AuthTokenBridge } from './host/auth/AuthTokenBridge';
import { CartDrawer } from './modules/comparador/components/CartDrawer';
import { LocationSelector } from './modules/comparador/components/LocationSelector';
import { CartProvider, useCart } from './modules/comparador/contexts/CartContext';
import Cart from './modules/comparador/pages/Cart';
import Compare from './modules/comparador/pages/Compare';
import Explorar from './modules/comparador/pages/Explorar';
import Intereses from './modules/comparador/pages/Intereses';
import Onboarding from './modules/comparador/pages/Onboarding';
import Planner from './modules/comparador/pages/Planner';
import SignInPage from './host/auth/SignInPage';
import SignUpPage from './host/auth/SignUpPage';
import { FOCUS_RING } from './host/ui/styles';
import type {
  EnrichStatus,
  Interest,
  Product,
  PromoOffer,
  ShoppingItem,
  SuperKey,
  SyncLog,
  UserProfile,
} from './modules/comparador/types/api';

// ─── SyncPanel ────────────────────────────────────────────────────────────────
// Read-only status panel. POST triggers removed in PR2 (Decision 5).
// Manual sync/enrich/promo triggers are now ops CLI: `npm run ops <sync|enrich|promos>`.

interface SyncPanelProps {
  status: SyncLog[];
}

function SyncPanel({ status }: SyncPanelProps) {
  const [open, setOpen] = useState(false);
  const SYNC_KEYS: SuperKey[] = ['vea', 'carrefour', 'dia', 'masonline'];
  const anyRunning = status.some((s) => s.status === 'running');

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
        {anyRunning ? '⏳ Sincronizando…' : '⚡ Estado'}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 p-3 w-72 z-50">
          <p className="text-xs font-semibold text-gray-500 mb-3 px-1">Estado de sincronización</p>
          <p className="text-[11px] text-gray-400 mb-3 px-1">
            Para sincronizar precios usá el CLI: <code className="font-mono bg-gray-50 px-1 rounded">npm run ops sync</code>
          </p>

          {SYNC_KEYS.map((key) => {
            const s = status.find((x) => x.super === key);
            const pct =
              s && s.total_leaves > 0 ? Math.round((s.progress_leaf / s.total_leaves) * 100) : null;

            return (
              <div key={key} className="py-2 px-1 border-b border-gray-50 last:border-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-700 uppercase">{key}</span>
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
                {!s && (
                  <p className="text-xs text-gray-400">Sin datos</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── AppShell — rendered inside CartProvider so useCart() is available ────────

function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isSignedIn } = useAuth();
  const { itemCount, openCart } = useCart();
  const [interests, setInterests] = useState<Interest[]>([]);
  const [shopping, setShopping] = useState<ShoppingItem[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncLog[]>([]);
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

  // Public data — loaded for everyone, signed in or not (these endpoints are
  // @Public() on the backend). Runs once on mount.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional once-on-mount effect
  useEffect(() => {
    api.sync.status().then(setSyncStatus).catch(console.error);
    api.enrich.status().then(applyEnrichStatus).catch(console.error);
    api.promos.list().then(setPromos).catch(console.error);
  }, []);

  // User-specific data — only fetched when a session exists. Fetching these
  // while signed out would hit protected routes and 401 (that was the console
  // spam). Re-runs when auth state flips (sign-in / sign-out).
  // biome-ignore lint/correctness/useExhaustiveDependencies: onboarding redirect is a one-time-on-load concern, not a nav dep
  useEffect(() => {
    if (!isSignedIn) {
      setInterests([]);
      setShopping([]);
      setProfile(undefined);
      return;
    }
    api.interests.list().then(setInterests).catch(console.error);
    api.shopping.list().then(setShopping).catch(console.error);
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
  }, [isSignedIn]);

  // Auto-poll while a sync is running (scheduler-initiated syncs show progress).
  useEffect(() => {
    const hasRunning = syncStatus.some((s) => s.status === 'running');
    if (!hasRunning) return;
    const id = setInterval(async () => {
      const fresh = await api.sync.status().catch(() => null);
      if (fresh) setSyncStatus(fresh);
    }, 3000);
    return () => clearInterval(id);
  }, [syncStatus]);

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
    // User-specific action: browsing is public, but saving requires an account.
    if (!isSignedIn) {
      navigate('/sign-in');
      return;
    }
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
    if (!isSignedIn) {
      navigate('/sign-in');
      return;
    }
    await api.shopping.add({ product_id: product.id, frequency_days });
    const fresh = await api.shopping.list();
    setShopping(fresh);
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

          {/* Sync status panel (read-only; triggers moved to ops CLI) */}
          <SyncPanel status={syncStatus} />

          {/* User account menu when signed in; a sign-in button otherwise.
              Browsing is public — auth only gates user-specific features. */}
          <SignedIn>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal">
              <button
                type="button"
                className={`text-xs font-medium px-3 py-1.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 transition-colors ${FOCUS_RING}`}
              >
                Ingresar
              </button>
            </SignInButton>
          </SignedOut>
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
              <RequireAuth>
                <Intereses
                  interests={interests}
                  onToggleInterest={toggleInterest}
                  onAddToShopping={addToShopping}
                  shoppingIds={shoppingIds}
                />
              </RequireAuth>
            }
          />
          <Route
            path="/planner"
            element={
              <RequireAuth>
                <Planner />
              </RequireAuth>
            }
          />
          <Route
            path="/cart"
            element={
              <RequireAuth>
                <Cart />
              </RequireAuth>
            }
          />
          <Route
            path="/compare"
            element={
              <RequireAuth>
                <Compare />
              </RequireAuth>
            }
          />
          <Route
            path="/onboarding"
            element={
              <RequireAuth>
                <Onboarding
                  onComplete={(p) => {
                    setProfile(p);
                    navigate('/planner', { replace: true });
                  }}
                />
              </RequireAuth>
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

/**
 * Gates a single route: renders its children when signed in, otherwise sends
 * the user to Clerk's sign-in. Used only for user-specific pages — browsing
 * the catalog is public and never wrapped in this.
 */
function RequireAuth({ children }: { children: ReactNode }) {
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}

export default function App() {
  return (
    <>
      {/* AuthTokenBridge registers Clerk's getToken with api.ts.
          It renders null and must live inside <ClerkProvider> (set in main.tsx). */}
      <AuthTokenBridge />
      <Routes>
        {/* Clerk-hosted auth routes */}
        <Route path="/sign-in/*" element={<SignInPage />} />
        <Route path="/sign-up/*" element={<SignUpPage />} />

        {/* Everything else renders for everyone — browsing the catalog is public.
            User-specific pages are gated individually inside AppShell (RequireAuth). */}
        <Route
          path="/*"
          element={
            <CartProvider>
              <AppShell />
            </CartProvider>
          }
        />
      </Routes>
    </>
  );
}
