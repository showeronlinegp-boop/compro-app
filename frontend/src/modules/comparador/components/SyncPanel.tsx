import { useState } from 'react';
import type { SuperKey, SyncLog } from '../types/api';

// ─── SyncPanel ────────────────────────────────────────────────────────────────
// Read-only status panel. POST triggers removed in PR2 (Decision 5).
// Manual sync/enrich/promo triggers are now ops CLI: `npm run ops <sync|enrich|promos>`.

interface SyncPanelProps {
  status: SyncLog[];
}

export function SyncPanel({ status }: SyncPanelProps) {
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
