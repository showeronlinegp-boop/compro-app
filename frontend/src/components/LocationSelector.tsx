import { useState } from 'react';
import { api } from '../api';
import { superCfg } from '../supers';
import type { StoresResolveResult, SuperKey, UserProfile } from '../types/api';

export interface LocationSelectorProps {
  postalCode: string | null;
  onSaved: (profile: UserProfile) => void;
}

// Supers that expose physical stores. VEA (Cencosud) does not, so it falls back
// to its default region and is shown as informational only.
const STORE_SUPERS: SuperKey[] = ['carrefour', 'dia', 'masonline'];

export default function LocationSelector({ postalCode, onSaved }: LocationSelectorProps) {
  const [open, setOpen] = useState(false);
  const [cp, setCp] = useState(postalCode ?? '');
  const [preview, setPreview] = useState<StoresResolveResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    const digits = cp.replace(/\D/g, '').slice(0, 4);
    if (digits.length < 4) {
      setError('Ingresá un CP de 4 dígitos');
      return;
    }
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      setPreview(await api.profile.resolveStores(digits));
    } catch {
      setError('No se pudo resolver el código postal');
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!preview) return;
    setSaving(true);
    setError(null);
    try {
      onSaved(await api.profile.setLocation(preview.postal_code));
      setOpen(false);
    } catch {
      setError('No se pudo guardar la ubicación');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`text-xs font-medium px-3 py-1.5 rounded-xl border transition-colors ${
          postalCode
            ? 'border-gray-200 text-gray-600 hover:bg-gray-50'
            : 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
        }`}
      >
        📍 {postalCode ? `CP ${postalCode}` : 'Cargá tu zona'}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 p-3 w-80 z-50">
          <p className="text-xs font-semibold text-gray-500 mb-2 px-1">Tu ubicación</p>
          <p className="text-[11px] text-gray-400 mb-2 px-1 leading-snug">
            Usamos tu CP para traer precios y stock de las tiendas de tu zona.
          </p>

          <div className="flex gap-1.5">
            <input
              type="text"
              inputMode="numeric"
              value={cp}
              onChange={(e) => setCp(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder="Ej: 2700"
              maxLength={8}
              className="flex-1 min-w-0 text-xs border border-gray-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <button
              type="button"
              onClick={search}
              disabled={loading}
              className="text-xs px-3 py-1.5 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 font-medium"
            >
              {loading ? '…' : 'Buscar'}
            </button>
          </div>

          {error && <p className="text-[11px] text-red-500 mt-1.5 px-1">{error}</p>}

          {preview && (
            <div className="mt-3 flex flex-col gap-1.5">
              {STORE_SUPERS.map((key) => {
                const list = preview.supers[key] ?? [];
                const nearest = list[0];
                return (
                  <div key={key} className="flex items-center justify-between text-[11px] px-1">
                    <span className="font-semibold text-gray-600">{superCfg(key).label}</span>
                    <span className={nearest ? 'text-green-600' : 'text-gray-400'}>
                      {nearest
                        ? `✓ ${nearest.city ?? nearest.name}${list.length > 1 ? ` (+${list.length - 1})` : ''}`
                        : 'sin tiendas en tu zona'}
                    </span>
                  </div>
                );
              })}
              <div className="flex items-center justify-between gap-2 text-[11px] px-1 pt-1 border-t border-gray-100">
                <span className="font-semibold text-gray-600 shrink-0">
                  {superCfg('vea').label}
                </span>
                <span className="text-gray-400 text-right">
                  precios generales · no soporta búsqueda por zona
                </span>
              </div>

              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="mt-1 w-full text-xs px-3 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 font-medium"
              >
                {saving ? 'Guardando…' : 'Guardar ubicación'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
