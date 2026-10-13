import type { ReactNode } from 'react';
import { Button } from '../../host/ui/Button';
import { IconCheck, IconPlus } from '../../host/ui/icons';
import { formatMoney } from '../../host/ui/format';
import { Avatar, Card, EmptyNote, ListRow, Pill } from '../../host/ui/surfaces';
import type { Cliente, Cobro, Movimiento } from './api';
import { DIAS_TARDE, lineaCliente, textoDias, textoFecha, textoSaldo, textoTipo } from './textos';

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

// ─── Fila de "Para cobrar hoy" (variante de §4.3) ─────────────────────────────

/**
 * Saldo y días juntos en la línea secundaria; a la derecha "Recordar", o
 * "Recordado" en verde si ya se le mandó el recordatorio hoy.
 */
export function FilaCobro({
  cobro,
  onAbrir,
  onRecordar,
}: {
  cobro: Cobro;
  onAbrir: () => void;
  onRecordar: () => void;
}) {
  const tarde = (cobro.dias_sin_pagar ?? 0) > DIAS_TARDE;
  const dias = textoDias(cobro.dias_sin_pagar);
  return (
    <ListRow
      onClick={onAbrir}
      leading={<Avatar name={cobro.nombre} />}
      title={cobro.nombre}
      subtitle={
        <span>
          {formatMoney(cobro.saldo)}
          {dias && (
            <>
              {' · '}
              <span className={tarde ? 'text-late font-bold' : ''}>{dias}</span>
            </>
          )}
        </span>
      }
      action={
        cobro.recordado_hoy ? (
          <span className="inline-flex items-center gap-1 text-body-s font-bold text-ok">
            <IconCheck size={18} />
            Recordado
          </span>
        ) : (
          <Button variant="outline" size="s" onClick={onRecordar}>
            Recordar
          </Button>
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
  onRecordar,
  compacto = false,
}: {
  onAnotar: (tipo: 'fiado' | 'pago') => void;
  /** Sólo en la ficha y si debe algo: tercer botón "Recordar". */
  onRecordar?: () => void;
  compacto?: boolean;
}) {
  const size = compacto ? 'l' : 'xl';
  return (
    <div className={`grid gap-3 ${onRecordar ? 'grid-cols-3' : 'grid-cols-2'}`}>
      <Button variant="fiado" size={size} icon={<IconPlus />} onClick={() => onAnotar('fiado')}>
        {compacto ? 'Fiado' : 'Anotar fiado'}
      </Button>
      <Button variant="pago" size={size} icon={<IconPlus />} onClick={() => onAnotar('pago')}>
        {compacto ? 'Pago' : 'Registrar pago'}
      </Button>
      {onRecordar && (
        <Button variant="outline" size={size} onClick={onRecordar}>
          Recordar
        </Button>
      )}
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
