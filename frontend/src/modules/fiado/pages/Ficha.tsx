import { useNavigate, useParams } from 'react-router-dom';
import { ScreenHeader } from '../../../host/ui/ScreenHeader';
import { formatMoney } from '../../../host/ui/format';
import {
  Avatar,
  Card,
  DataCells,
  EmptyNote,
  List,
  Notice,
  Pill,
  Section,
} from '../../../host/ui/surfaces';
import { type Cliente, fiadoApi } from '../api';
import { AccionesMovimiento, Cargando, ErrorCarga, FilaMovimiento } from '../components';
import { RUTAS } from '../rutas';
import { textoDia, textoDias, textoSaldo } from '../textos';
import { useCarga } from '../useCarga';

/** Tarjeta principal de la ficha: identidad, saldo, celdas y aviso de límite. */
export function TarjetaFicha({ cliente: c }: { cliente: Cliente }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <Avatar name={c.nombre} size="l" />
        <div className="min-w-0">
          <h2 className="m-0 font-display text-title-m text-ink truncate">{c.nombre}</h2>
          {c.telefono && <p className="m-0 text-body-s text-ink-muted">{c.telefono}</p>}
          {c.etiqueta && (
            <span className="mt-1 inline-block">
              <Pill>{c.etiqueta}</Pill>
            </span>
          )}
        </div>
      </div>

      <p className="m-0 mt-4 text-body text-ink-muted">
        {c.saldo < 0 ? 'Tiene a favor' : 'Te debe'}
      </p>
      <p className="m-0 mb-4 font-display text-amount-m text-ink">{textoSaldo(c.saldo)}</p>

      <DataCells
        cells={[
          { label: 'Límite', value: c.limite != null ? formatMoney(c.limite) : 'Sin límite' },
          {
            label: 'Sin pagar',
            value: textoDias(c.dias_sin_pagar)?.replace(' sin pagar', '') ?? '—',
          },
          { label: 'Próx. cobro', value: textoDia(c.proximo_cobro) },
        ]}
      />

      {c.excede_limite && c.limite != null && (
        <div className="mt-3">
          <Notice>
            Pasó el límite de {formatMoney(c.limite)}. Podés seguir anotando, pero conviene cobrarle
            antes.
          </Notice>
        </div>
      )}
    </Card>
  );
}

/** Ficha del cliente: datos, saldo e historial completo (correcciones incluidas). */
export default function Ficha() {
  const { id } = useParams();
  const clienteId = Number(id);
  const navigate = useNavigate();
  const carga = useCarga(() => fiadoApi.ficha(clienteId), [clienteId]);

  return (
    <div className="flex flex-col gap-5 px-4 pt-4 pb-6">
      <ScreenHeader
        variant="task"
        backStyle="label"
        titleHidden
        title={carga.data?.cliente.nombre ?? 'Cliente'}
        backTo={RUTAS.clientes}
      />

      {carga.error && !carga.data && (
        <ErrorCarga mensaje={carga.error} onReintentar={carga.recargar} />
      )}
      {!carga.data && !carga.error && <Cargando />}

      {carga.data && (
        <>
          <TarjetaFicha cliente={carga.data.cliente} />

          <AccionesMovimiento
            compacto
            onAnotar={(tipo) => navigate(RUTAS.anotar(tipo, clienteId))}
            onRecordar={
              carga.data.cliente.saldo > 0 ? () => navigate(RUTAS.recordar(clienteId)) : undefined
            }
          />

          <Section title="Historial">
            <List label="Historial">
              {carga.data.historial.length === 0 ? (
                <li>
                  <EmptyNote>Todavía no hay movimientos.</EmptyNote>
                </li>
              ) : (
                carga.data.historial.map((m) => <FilaMovimiento key={m.id} movimiento={m} />)
              )}
            </List>
          </Section>
        </>
      )}
    </div>
  );
}
