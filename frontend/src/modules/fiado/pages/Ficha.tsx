import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../../host/ui/Button';
import { ScreenHeader } from '../../../host/ui/ScreenHeader';
import { useToast } from '../../../host/ui/Toast';
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
import { type Cliente, type Movimiento, fiadoApi } from '../api';
import { AccionesMovimiento, Cargando, ErrorCarga, FilaMovimiento } from '../components';
import { BotonPerdonar, TarjetaAvisoRecargo, TarjetaRecargos } from '../recargos';
import { RUTAS } from '../rutas';
import { textoDia, textoDias, textoSaldo } from '../textos';
import { useCarga } from '../useCarga';

/**
 * Un recargo se puede perdonar mientras no se haya corregido ni pagado nada
 * (se perdona entero: si ya pagó una parte, perdonarlo le dejaría saldo a favor).
 */
function perdonable(m: Movimiento): boolean {
  return m.tipo === 'recargo' && m.corregido_por == null && m.pendiente === m.monto;
}

/** Tarjeta principal de la ficha: identidad, saldo, celdas y aviso de límite. */
export function TarjetaFicha({
  cliente: c,
  onEditar,
}: {
  cliente: Cliente;
  /** Si viene, muestra "Editar" para corregir nombre, teléfono y límite. */
  onEditar?: () => void;
}) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <Avatar name={c.nombre} size="l" />
        <div className="min-w-0 flex-1">
          <h2 className="m-0 font-display text-title-m text-ink truncate">{c.nombre}</h2>
          {c.telefono && <p className="m-0 text-body-s text-ink-muted">{c.telefono}</p>}
          {c.etiqueta && (
            <span className="mt-1 inline-block">
              <Pill>{c.etiqueta}</Pill>
            </span>
          )}
        </div>
        {onEditar && (
          <Button variant="text" size="s" onClick={onEditar}>
            Editar
          </Button>
        )}
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
          { label: 'Próx. vence', value: textoDia(c.proximo_vencimiento?.fecha ?? null) },
        ]}
      />

      {c.vencido > 0 && (
        <p className="m-0 mt-3 text-body-s font-bold text-late">
          Tiene {formatMoney(c.vencido)} vencido.
        </p>
      )}

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

/**
 * Ficha del cliente: datos, saldo, recargos por atraso (aviso de condiciones o
 * sugerencia) e historial completo (correcciones incluidas).
 */
export default function Ficha() {
  const { id } = useParams();
  const clienteId = Number(id);
  const navigate = useNavigate();
  const toast = useToast();
  const carga = useCarga(() => fiadoApi.ficha(clienteId), [clienteId]);
  const recargo = carga.data?.recargo ?? null;
  const porId = new Map((carga.data?.historial ?? []).map((m) => [m.id, m]));

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
          <TarjetaFicha
            cliente={carga.data.cliente}
            onEditar={() => navigate(RUTAS.editarCliente(clienteId))}
          />

          {recargo?.aviso && (
            <TarjetaAvisoRecargo
              cliente={carga.data.cliente}
              texto={recargo.aviso.texto}
              onAvisado={() => {
                toast.show('Listo, quedó registrado que le avisaste.');
                carga.recargar();
              }}
            />
          )}

          {recargo && recargo.sugeridos.length > 0 && (
            <TarjetaRecargos
              clienteId={clienteId}
              recargo={recargo}
              onCambio={carga.recargar}
              onSumados={(estado) => navigate(RUTAS.listo, { state: estado })}
            />
          )}

          <AccionesMovimiento
            compacto
            fiadoBloqueado={carga.data.cliente.aviso_recargo_pendiente}
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
                carga.data.historial.map((m) => (
                  <FilaMovimiento
                    key={m.id}
                    movimiento={m}
                    fiadoFecha={m.recargo_de ? porId.get(m.recargo_de)?.created_at : undefined}
                    action={
                      perdonable(m) ? (
                        <BotonPerdonar
                          recargo={m}
                          onPerdonado={(error) => {
                            toast.show(
                              error ??
                                `Perdonaste el recargo de ${formatMoney(m.monto)}. Queda en el historial como corrección.`,
                            );
                            if (!error) carga.recargar();
                          }}
                        />
                      ) : undefined
                    }
                  />
                ))
              )}
            </List>
          </Section>
        </>
      )}
    </div>
  );
}
