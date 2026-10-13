import { useEffect, useState } from 'react';
import { Button } from '../../host/ui/Button';
import { TextField } from '../../host/ui/controls';
import { formatMoney } from '../../host/ui/format';
import { IconPlus } from '../../host/ui/icons';
import { FOCUS_RING } from '../../host/ui/styles';
import { Card, EmptyNote } from '../../host/ui/surfaces';
import { type Cliente, fiadoApi } from './api';
import { textoSaldo } from './textos';

/** Resultados que se muestran mientras se busca (guía §4.8). */
const MAX_RESULTADOS = 5;

interface SelectorClienteProps {
  cliente: Cliente | null;
  onElegir: (c: Cliente | null) => void;
  /** "+ Crear cliente nuevo" con lo que se tipeó como nombre. */
  onCrear: (nombre: string) => void;
}

/**
 * Selector de cliente dentro de Anotar.
 * - Sin cliente: "¿A quién?" + hasta 5 resultados + "Crear cliente nuevo".
 * - Con cliente: tarjeta compacta con el saldo actual y "Cambiar".
 */
export function SelectorCliente({ cliente, onElegir, onCrear }: SelectorClienteProps) {
  if (cliente) {
    return (
      <Card padding="compact">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="m-0 text-body font-bold text-ink truncate">{cliente.nombre}</p>
            <p className="m-0 text-caption text-ink-muted">
              Saldo actual {textoSaldo(cliente.saldo)}
            </p>
          </div>
          <Button variant="soft" size="s" onClick={() => onElegir(null)}>
            Cambiar
          </Button>
        </div>
      </Card>
    );
  }
  return <Buscador onElegir={onElegir} onCrear={onCrear} />;
}

function Buscador({ onElegir, onCrear }: Pick<SelectorClienteProps, 'onElegir' | 'onCrear'>) {
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState<Cliente[] | null>(null);

  useEffect(() => {
    let vigente = true;
    const t = setTimeout(() => {
      fiadoApi
        .clientes(q.trim(), q.trim() ? 'az' : 'deuda')
        .then((r) => {
          if (vigente) setResultados(r.slice(0, MAX_RESULTADOS));
        })
        .catch(() => {
          if (vigente) setResultados([]);
        });
    }, 200);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div className="flex flex-col gap-2">
      <TextField
        label="¿A quién?"
        labelTone="question"
        type="search"
        inputMode="search"
        autoComplete="off"
        placeholder="Buscá por nombre"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <ul
        aria-label="Clientes encontrados"
        className="m-0 p-0 list-none bg-surface rounded-l overflow-hidden"
      >
        {resultados?.length === 0 && q.trim() !== '' && (
          <li>
            <EmptyNote>No hay clientes con ese nombre.</EmptyNote>
          </li>
        )}
        {resultados?.map((c) => (
          <li key={c.id} className="border-b border-line">
            <button
              type="button"
              onClick={() => onElegir(c)}
              className={`pressable w-full min-h-[48px] px-[14px] flex items-center justify-between gap-3 bg-surface text-left ${FOCUS_RING}`}
            >
              <span className="text-body font-bold text-ink truncate">{c.nombre}</span>
              <span className="font-display text-body font-bold text-ink-muted flex-none">
                {formatMoney(c.saldo)}
              </span>
            </button>
          </li>
        ))}
        <li>
          <Button
            variant="text"
            size="s"
            block
            icon={<IconPlus size={20} />}
            className="justify-start rounded-none px-[14px] min-h-[48px]"
            onClick={() => onCrear(q.trim())}
          >
            Crear cliente nuevo
          </Button>
        </li>
      </ul>
    </div>
  );
}
