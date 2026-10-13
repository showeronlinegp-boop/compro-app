import { useAuth } from '@clerk/clerk-react';
import {
  type MutableRefObject,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from './api';
import { CartProvider } from './contexts/CartContext';
import type {
  EnrichStatus,
  Interest,
  Product,
  PromoOffer,
  ShoppingItem,
  SyncLog,
  UserProfile,
} from './types/api';

// ─── ComparadorProvider — estado del dominio (ex-AppShell) ───────────────────
// Migrado literal desde el viejo `AppShell` de App.tsx: mismo estado, refs,
// efectos (carga pública, carga de usuario + redirección a onboarding, polling
// de sync/enrich cada 3 s con cleanup) y acciones. Sin useMemo a propósito:
// re-renderiza igual que las props de antes.

export interface ComparadorContextValue {
  interests: Interest[];
  shopping: ShoppingItem[];
  shoppingIds: Set<number>;
  syncStatus: SyncLog[];
  enrichStatus: Record<string, EnrichStatus>;
  enrichDone: string[];
  promos: PromoOffer[];
  /** `undefined` = todavía no cargado (o sin sesión). */
  profile: UserProfile | null | undefined;
  setProfile: (p: UserProfile | null | undefined) => void;
  /** Última URL de Explorar (pathname + search) para que la nav la restaure. */
  explorarTo: MutableRefObject<string>;
  toggleInterest: (product: Product) => Promise<void>;
  addToShopping: (product: Product, frequency_days: number) => Promise<void>;
}

const ComparadorContext = createContext<ComparadorContextValue | null>(null);

function ComparadorStateProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isSignedIn } = useAuth();
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

  return (
    <ComparadorContext.Provider
      value={{
        interests,
        shopping,
        shoppingIds,
        syncStatus,
        enrichStatus,
        enrichDone,
        promos,
        profile,
        setProfile,
        explorarTo,
        toggleInterest,
        addToShopping,
      }}
    >
      {children}
    </ComparadorContext.Provider>
  );
}

/** Provider del módulo: `CartProvider` afuera (como antes en App) y el estado del comparador adentro. */
export function ComparadorProvider({ children }: { children: ReactNode }) {
  return (
    <CartProvider>
      <ComparadorStateProvider>{children}</ComparadorStateProvider>
    </CartProvider>
  );
}

/** Estado y acciones del comparador. Sólo dentro de `<ComparadorProvider>`. */
export function useComparador(): ComparadorContextValue {
  const ctx = useContext(ComparadorContext);
  if (!ctx) throw new Error('useComparador debe usarse dentro de <ComparadorProvider>');
  return ctx;
}
