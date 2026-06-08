import { useState, useEffect } from 'react';
import { api } from '../api.js';
import { superCfg, pesos, freqLabel, FREQ_OPTIONS } from '../supers.js';

export default function Planner() {
  const [list, setList]     = useState([]);
  const [weekly, setWeekly] = useState([]);
  const [tab, setTab]       = useState('list');
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    setLoading(true);
    try {
      const [l, w] = await Promise.all([api.shopping.list(), api.shopping.weekly()]);
      setList(l);
      setWeekly(w);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  async function markBought(item) {
    const today = new Date().toISOString().slice(0, 10);
    await api.shopping.update(item.shopping_id, { last_bought: today });
    loadAll();
  }

  async function changeFreq(item, days) {
    await api.shopping.update(item.shopping_id, { frequency_days: Number(days) });
    loadAll();
  }

  async function removeItem(item) {
    await api.shopping.remove(item.shopping_id);
    loadAll();
  }

  const totalWeekly = weekly.reduce((acc, g) => acc + g.total, 0);

  if (loading) {
    return <div className="max-w-5xl mx-auto px-4 py-12 text-center text-gray-400 text-sm">Cargando…</div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl mb-6 w-fit">
        {[{ id: 'list', label: '📋 Mi lista' }, { id: 'weekly', label: `🛒 Esta semana (${weekly.reduce((a, g) => a + g.items.length, 0)})` }].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`text-sm font-semibold px-4 py-2 rounded-xl transition-colors ${
              tab === t.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'list' && (
        <ListTab list={list} onMarkBought={markBought} onChangeFreq={changeFreq} onRemove={removeItem} />
      )}
      {tab === 'weekly' && (
        <WeeklyTab groups={weekly} total={totalWeekly} onMarkBought={markBought} />
      )}
    </div>
  );
}

function ListTab({ list, onMarkBought, onChangeFreq, onRemove }) {
  if (list.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-4xl mb-3">📋</p>
        <p className="font-medium">La lista está vacía</p>
        <p className="text-sm mt-1">Desde "Mis Intereses" agregá productos con su frecuencia de compra</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {list.map(item => {
        const cfg   = superCfg(item.super);
        const price = item.offer_price ?? item.raw_price;
        const due   = isDue(item);

        return (
          <div key={item.shopping_id} className={`bg-white rounded-2xl border shadow-sm p-3 flex items-center gap-3 ${due ? 'border-indigo-200' : 'border-gray-100'}`}>
            {/* Img */}
            <div className="w-12 h-12 flex-shrink-0 rounded-xl bg-gray-50 flex items-center justify-center overflow-hidden">
              {item.image_url
                ? <img src={item.image_url} alt={item.name} className="w-full h-full object-contain" />
                : <span className="text-xl text-gray-200">🛒</span>
              }
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                {due && <span className="text-xs text-indigo-600 font-semibold">● Toca comprar</span>}
              </div>
              <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-xs text-gray-500">{pesos(price)}</span>
                <span className="text-xs text-gray-400">
                  {item.last_bought ? `Último: ${item.last_bought}` : 'Nunca comprado'}
                </span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <select
                value={item.frequency_days}
                onChange={e => onChangeFreq(item, e.target.value)}
                className="text-xs py-1 px-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-600 focus:outline-none"
              >
                {FREQ_OPTIONS.map(o => (
                  <option key={o.days} value={o.days}>{o.label}</option>
                ))}
              </select>

              <button
                onClick={() => onMarkBought(item)}
                title="Marcar como comprado hoy"
                className="text-xs px-2.5 py-1.5 rounded-xl bg-green-50 text-green-600 border border-green-200 hover:bg-green-100 font-medium"
              >
                ✓
              </button>

              <button
                onClick={() => onRemove(item)}
                title="Quitar de la lista"
                className="text-xs px-2.5 py-1.5 rounded-xl bg-gray-50 text-gray-400 border border-gray-200 hover:bg-red-50 hover:text-red-400 hover:border-red-200"
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeeklyTab({ groups, total, onMarkBought }) {
  if (groups.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-4xl mb-3">✅</p>
        <p className="font-medium">Todo al día</p>
        <p className="text-sm mt-1">No hay productos que comprar esta semana</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3 flex justify-between items-center">
        <span className="text-sm font-medium text-indigo-700">Total estimado esta semana</span>
        <span className="text-lg font-bold text-indigo-900">{pesos(total)}</span>
      </div>

      {groups.map(group => {
        const cfg = superCfg(group.super);
        return (
          <div key={group.super} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Header super */}
            <div className={`px-4 py-2.5 flex justify-between items-center ${cfg.bg}`}>
              <span className={`font-bold text-sm ${cfg.text}`}>{cfg.label}</span>
              <span className={`text-sm font-semibold ${cfg.text} opacity-90`}>{pesos(group.total)}</span>
            </div>

            {/* Items */}
            <div className="divide-y divide-gray-50">
              {group.items.map(item => {
                const price = item.offer_price ?? item.raw_price;
                return (
                  <div key={item.shopping_id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="w-9 h-9 flex-shrink-0 rounded-lg bg-gray-50 flex items-center justify-center overflow-hidden">
                      {item.image_url
                        ? <img src={item.image_url} alt={item.name} className="w-full h-full object-contain" />
                        : <span className="text-sm text-gray-200">🛒</span>
                      }
                    </div>
                    <p className="flex-1 text-sm text-gray-800 truncate">{item.name}</p>
                    <span className="text-sm font-semibold text-gray-900 flex-shrink-0">{pesos(price)}</span>
                    <button
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

function isDue(item) {
  if (!item.last_bought) return true;
  const last = new Date(item.last_bought);
  const now  = new Date();
  const diff = (now - last) / (1000 * 60 * 60 * 24);
  return diff >= item.frequency_days;
}
