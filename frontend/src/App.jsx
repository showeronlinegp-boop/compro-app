import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { api } from './api.js';
import Explorar  from './pages/Explorar.jsx';
import Intereses from './pages/Intereses.jsx';
import Planner   from './pages/Planner.jsx';

export default function App() {
  const [interests, setInterests]   = useState([]);
  const [shopping, setShopping]     = useState([]);
  const [syncStatus, setSyncStatus]     = useState([]);
  const [syncing, setSyncing]           = useState('');
  const [enrichStatus, setEnrichStatus] = useState({});
  const location = useLocation();

  useEffect(() => {
    api.interests.list().then(setInterests).catch(console.error);
    api.shopping.list().then(setShopping).catch(console.error);
    api.sync.status().then(setSyncStatus).catch(console.error);
    api.enrich.status().then(setEnrichStatus).catch(console.error);
  }, []);

  // Poll automático mientras haya un sync corriendo
  useEffect(() => {
    const hasRunning = syncStatus.some(s => s.status === 'running') || !!syncing;
    if (!hasRunning) return;
    const id = setInterval(async () => {
      const fresh = await api.sync.status().catch(() => null);
      if (!fresh) return;
      setSyncStatus(fresh);
      if (!fresh.some(s => s.status === 'running')) {
        setSyncing('');
      }
    }, 3000);
    return () => clearInterval(id);
  }, [syncStatus, syncing]);

  // Poll automático mientras haya enriquecimiento corriendo
  useEffect(() => {
    const anyEnriching = Object.values(enrichStatus).some(s => s.running);
    if (!anyEnriching) return;
    const id = setInterval(async () => {
      const fresh = await api.enrich.status().catch(() => null);
      if (fresh) setEnrichStatus(fresh);
    }, 3000);
    return () => clearInterval(id);
  }, [enrichStatus]);

  async function toggleInterest(product) {
    const existing = interests.find(i => i.id === product.id);
    if (existing) {
      await api.interests.remove(existing.interest_id);
      setInterests(prev => prev.filter(i => i.interest_id !== existing.interest_id));
    } else {
      const created = await api.interests.add(product.id);
      // reload para tener el objeto completo
      const fresh = await api.interests.list();
      setInterests(fresh);
    }
  }

  async function addToShopping(product, frequency_days) {
    await api.shopping.add({ product_id: product.id, frequency_days });
    const fresh = await api.shopping.list();
    setShopping(fresh);
  }

  async function triggerEnrich(superKey) {
    try {
      if (superKey) {
        await api.enrich.trigger(superKey);
      } else {
        await api.enrich.triggerAll();
      }
      const fresh = await api.enrich.status().catch(() => null);
      if (fresh) setEnrichStatus(fresh);
    } catch (e) {
      console.error(e);
    }
  }

  async function triggerSync(superKey) {
    setSyncing(superKey);
    try {
      await api.sync.trigger(superKey);
      // El useEffect de polling se activa automáticamente
      const fresh = await api.sync.status();
      setSyncStatus(fresh);
    } catch (e) {
      setSyncing('');
    }
  }

  const shoppingIds = new Set(shopping.map(s => s.id));

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 flex items-center h-14 gap-6">
          <span className="font-bold text-gray-900 text-base tracking-tight">🛒 COMPRO</span>

          <div className="flex gap-1 flex-1">
            {[
              { to: '/',          label: 'Explorar'  },
              { to: '/intereses', label: `Intereses ${interests.length ? `(${interests.length})` : ''}` },
              { to: '/planner',   label: `Planner ${shopping.length ? `(${shopping.length})` : ''}` },
            ].map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `text-sm font-medium px-3 py-1.5 rounded-xl transition-colors ${
                    isActive ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </div>

          {/* Sync panel */}
          <SyncPanel status={syncStatus} syncing={syncing} onSync={triggerSync} />
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1">
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
                onEnrich={triggerEnrich}
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
        </Routes>
      </main>
    </div>
  );
}

function SyncPanel({ status, syncing, onSync }) {
  const [open, setOpen] = useState(false);
  const SUPER_KEYS = ['vea', 'carrefour', 'dia', 'masonline'];
  const anyRunning = status.some(s => s.status === 'running') || !!syncing;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
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
          {SUPER_KEYS.map(key => {
            const s = status.find(x => x.super === key);
            const isRunning = syncing === key || s?.status === 'running';
            const pct = s?.total_leaves > 0
              ? Math.round((s.progress_leaf / s.total_leaves) * 100)
              : null;

            return (
              <div key={key} className="py-2 px-1 border-b border-gray-50 last:border-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-700 uppercase">{key}</span>
                  <button
                    onClick={() => { onSync(key); setOpen(false); }}
                    disabled={isRunning || !!syncing}
                    className="text-xs px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-40 font-medium"
                  >
                    {isRunning ? 'Corriendo' : 'Sync'}
                  </button>
                </div>

                {/* Info / barra de progreso */}
                {s?.status === 'running' && s.total_leaves > 0 && (
                  <div className="mt-1">
                    <div className="flex justify-between text-xs text-gray-400 mb-0.5">
                      <span>{s.progress_leaf}/{s.total_leaves} hojas</span>
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
                    ✓ {s.product_count?.toLocaleString('es-AR')} productos · {s.finished_at?.slice(0, 10)}
                  </p>
                )}
                {s?.status === 'error' && (
                  <p className="text-xs text-red-500">✕ {s.error?.slice(0, 40)}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
