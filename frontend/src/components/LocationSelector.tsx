import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { GeoSuggestion, UserProfile } from '../types/api';

interface Props {
  location: string | null;
  onSaved: (profile: UserProfile) => void;
}

export function LocationSelector({ location, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<GeoSuggestion[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClick);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearchLoading(true);
      try {
        setSuggestions(await api.profile.searchLocations(q));
      } catch {
        setSuggestions([]);
      } finally {
        setSearchLoading(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [query]);

  async function pick(geo: GeoSuggestion) {
    setSuggestions([]);
    setQuery('');
    setSaving(true);
    setError(null);
    try {
      onSaved(await api.profile.setLocation(geo.lat, geo.lng, geo.display_name));
      setOpen(false);
    } catch {
      setError('No pudimos guardar la ubicación');
    } finally {
      setSaving(false);
    }
  }

  async function handleGps() {
    if (!navigator.geolocation) {
      setError('Tu navegador no soporta geolocalización');
      return;
    }
    setSaving(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          onSaved(
            await api.profile.setLocation(pos.coords.latitude, pos.coords.longitude),
          );
          setOpen(false);
        } catch {
          setError('No pudimos guardar la ubicación');
        } finally {
          setSaving(false);
        }
      },
      () => {
        setError('No pudimos acceder a tu ubicación');
        setSaving(false);
      },
    );
  }

  const displayLabel = location
    ? location.length > 22
      ? location.slice(0, 22) + '…'
      : location
    : null;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`text-xs font-medium px-3 py-1.5 rounded-xl border transition-colors ${
          location
            ? 'border-gray-200 text-gray-600 hover:bg-gray-50'
            : 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
        }`}
      >
        📍 {displayLabel ?? 'Elegí tu zona'}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 p-3 w-80 z-50">
          <p className="text-xs font-semibold text-gray-500 mb-2 px-1">Tu ubicación</p>

          {error && <p className="text-[11px] text-red-500 mb-2 px-1">{error}</p>}

          {saving ? (
            <p className="text-[11px] text-gray-400 px-1 py-2">Guardando…</p>
          ) : (
            <>
              <button
                type="button"
                onClick={handleGps}
                className="w-full text-xs text-left px-2.5 py-2 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium mb-2 transition-colors"
              >
                📍 Usar mi ubicación
              </button>

              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-[10px] text-gray-400">o buscá tu barrio</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>

              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ej: Palermo, Pergamino…"
                className="w-full text-xs border border-gray-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />

              {searchLoading && (
                <p className="text-[11px] text-gray-400 px-1 mt-1">Buscando…</p>
              )}

              {suggestions.length > 0 && (
                <div className="mt-1 flex flex-col border border-gray-100 rounded-xl overflow-hidden">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => pick(s)}
                      className="text-left text-[11px] px-2.5 py-2 hover:bg-gray-50 text-gray-700 border-b border-gray-50 last:border-b-0 transition-colors"
                    >
                      {s.display_name}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
