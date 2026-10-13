import type { ReactNode } from 'react';
import { Button } from '../../host/ui/Button';
import { IconPlus } from '../../host/ui/icons';
import { formatMoney } from '../../host/ui/format';
import { Avatar, Card, EmptyNote, ListRow, Pill } from '../../host/ui/surfaces';
import type { Cliente, Movimiento } from './api';
import { DIAS_TARDE, lineaCliente, textoFecha, textoSaldo, textoTipo } from './textos';

// ─── Fila de cliente (guía §4.3) ──────────────────────────────────────────────

interface FilaClienteProps {
  cliente: Cliente;
  onClick?: () => void;
  /** Reemplaza lo de la derecha (p. ej. botón "Recordar" en "Para cobrar hoy"). */
  accion?: ReactNode;
}

/** Avatar + nombre + días sin pagar; a la derecha el saldo y su etiqueta. */
export function FilaCliente({ cliente, onClick, accion }: FilaClienteProps) {
  const tarde = (cliente.dias_sin_pagar ?? 0) > DIAS_TARDE;
  return (
    <ListRow
      onClick={onClick}
      leading={<Avatar name={cliente.nombre} />}
      title={cliente.nombre}
      subtitle={<span className={tarde ? 'text-late font-bold' : ''}>{lineaCliente(cliente)}</span>}
      trailing={
        accion ?? (
          <span className="flex flex-col items-end gap-1 flex-none">
            <span className="font-display text-[17px] font-bold text-ink">
              {formatMoney(cliente.saldo)}
            </span>
            {cliente.excede_limite && <Pill tone="warn">Pasó el límite</Pill>}
            {cliente.saldo < 0 && <Pill tone="ok">a favor</Pill>}
          </span>
        )
      }
    />
  );
}

// ─── Fila de movimiento ───────────────────────────────────────────────────────

/**
 * Un movimiento del historial. Nada se oculta: un movimiento corregido se ve
 * tachado con la etiqueta "Corregido", y la corrección es su propia fila.
 */
export function FilaMovimiento({
  movimiento: m,
  conCliente = false,
  onClick,
}: {
  movimiento: Movimiento;
  /** Muestra el nombre del cliente (lista de últimos movimientos del inicio). */
  conCliente?: boolean;
  onClick?: () => void;
}) {
  const corregido = m.corregido_por != null;
  const color =
    m.tipo === 'fiado' ? 'text-fiado' : m.tipo === 'pago' ? 'text-pago' : 'text-ink-muted';
  const signo = m.monto > 0 ? '+' : '−';
  const titulo = conCliente ? m.cliente_nombre : textoTipo(m);
  const detalle = [conCliente ? textoTipo(m) : null, textoFecha(m.created_at), m.nota]
    .filter(Boolean)
    .join(' · ');
  return (
    <ListRow
      onClick={onClick}
      title={titulo}
      subtitle={m.tipo === 'correccion' ? `${detalle} · Deshace un movimiento anterior` : detalle}
      trailing={
        <span className="flex flex-col items-end gap-1 flex-none">
          <span
            className={`font-display text-[17px] font-bold ${color} ${corregido ? 'line-through' : ''}`}
          >
            {signo} {formatMoney(m.monto)}
          </span>
          {corregido && <Pill>Corregido</Pill>}
        </span>
      }
    />
  );
}

// ─── Acciones de fiado y pago ─────────────────────────────────────────────────

/**
 * Botones "Anotar fiado" / "Registrar pago". En el inicio son grandes (76 px);
 * en la ficha, compactos y con el cliente ya elegido.
 */
export function AccionesMovimiento({
  onAnotar,
  compacto = false,
}: {
  onAnotar: (tipo: 'fiado' | 'pago') => void;
  compacto?: boolean;
}) {
  const size = compacto ? 'l' : 'xl';
  return (
    <div className="grid grid-cols-2 gap-3">
      <Button variant="fiado" size={size} icon={<IconPlus />} onClick={() => onAnotar('fiado')}>
        {compacto ? 'Fiado' : 'Anotar fiado'}
      </Button>
      <Button variant="pago" size={size} icon={<IconPlus />} onClick={() => onAnotar('pago')}>
        {compacto ? 'Pago' : 'Registrar pago'}
      </Button>
    </div>
  );
}

// ─── Tarjeta "Te deben" (guía §4.2) ───────────────────────────────────────────

export function TarjetaTeDeben({ total, clientes }: { total: number; clientes: number }) {
  return (
    <Card>
      <p className="m-0 text-body text-ink-muted">Te deben</p>
      <p className="m-0 font-display text-amount-xl text-ink">{textoSaldo(total)}</p>
      <p className="m-0 text-body-s text-ink-muted">
        {clientes === 1 ? 'entre 1 cliente' : `entre ${clientes} clientes`}
      </p>
    </Card>
  );
}

// ─── Tarjeta Neggo (guía §4.12) ───────────────────────────────────────────────

/** El único bloque oscuro de la pantalla. Abre el pedido mayorista en otra pestaña. */
export function TarjetaNeggo({ href }: { href: string }) {
  return (
    <Card tone="dark">
      <p className="m-0 text-micro uppercase tracking-[1px] text-on-dark-muted">Neggo mayorista</p>
      <p className="m-0 mt-1 font-display text-[20px] font-bold text-surface">
        ¿Te falta mercadería?
      </p>
      <p className="m-0 mt-1 mb-4 text-body-s text-on-dark-body">
        Pedí a precio mayorista y te lo llevamos al local.
      </p>
      <Button
        variant="on-dark"
        size="m"
        onClick={() => window.open(href, '_blank', 'noopener,noreferrer')}
      >
        Pedir a Neggo
      </Button>
    </Card>
  );
}

// ─── Estados de carga ─────────────────────────────────────────────────────────

/** Error de carga dentro de la pantalla, con reintento. */
export function ErrorCarga({
  mensaje,
  onReintentar,
}: { mensaje: string; onReintentar: () => void }) {
  return (
    <Card>
      <p className="m-0 mb-3 text-body-s text-ink">{mensaje}</p>
      <Button variant="soft" size="s" onClick={onReintentar}>
        Probar de nuevo
      </Button>
    </Card>
  );
}

/** Placeholder accesible mientras carga (sin spinners animados). */
export function Cargando() {
  return (
    <output className="block">
      <EmptyNote>Cargando…</EmptyNote>
    </output>
  );
}
