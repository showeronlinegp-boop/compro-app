import { useNavigate } from 'react-router-dom';
import { EmptyNote, List, Pill, Section } from '../../../host/ui/surfaces';
import { fiadoApi } from '../api';
import {
  Cargando,
  ErrorCarga,
  FilaCliente,
  FilaMovimiento,
  TarjetaNeggo,
  TarjetaTeDeben,
} from '../components';
import { RUTAS } from '../rutas';
import { saludo } from '../textos';
import { useCarga } from '../useCarga';

const NEGGO_URL = import.meta.env.VITE_NEGGO_PEDIDOS_URL as string | undefined;

/**
 * Inicio de Fiado (guía §5 del mockup): comercio y saludo, total "Te deben",
 * "Para cobrar hoy", tarjeta Neggo y últimos movimientos.
 */
export default function Inicio() {
  const navigate = useNavigate();
  const carga = useCarga(() => Promise.all([fiadoApi.resumen(), fiadoApi.ajustes()]), []);

  const [resumen, ajustes] = carga.data ?? [null, null];

  return (
    <div className="flex flex-col gap-5 px-4 py-6">
      <header>
        <p className="m-0 text-body text-ink-muted">{ajustes?.comercio || 'Tu comercio'}</p>
        <h1 className="m-0 font-display text-title-m font-bold text-ink">{saludo()}</h1>
      </header>

      {carga.error && !resumen && (
        <ErrorCarga mensaje={carga.error} onReintentar={carga.recargar} />
      )}
      {!resumen && !carga.error && <Cargando />}

      {resumen && (
        <>
          <TarjetaTeDeben total={resumen.total} clientes={resumen.clientes_con_deuda} />

          <Section
            title="Para cobrar hoy"
            aside={
              resumen.para_cobrar.length > 0 ? (
                <Pill tone="late">{resumen.para_cobrar.length}</Pill>
              ) : undefined
            }
          >
            <List label="Para cobrar hoy">
              {resumen.para_cobrar.length === 0 ? (
                <li>
                  <EmptyNote>Nadie para cobrar hoy.</EmptyNote>
                </li>
              ) : (
                resumen.para_cobrar.map((c) => (
                  <FilaCliente key={c.id} cliente={c} onClick={() => navigate(RUTAS.ficha(c.id))} />
                ))
              )}
            </List>
          </Section>

          {NEGGO_URL && <TarjetaNeggo href={NEGGO_URL} />}

          <Section title="Últimos movimientos">
            <List label="Últimos movimientos">
              {resumen.ultimos.length === 0 ? (
                <li>
                  <EmptyNote>Todavía no hay movimientos.</EmptyNote>
                </li>
              ) : (
                resumen.ultimos.map((m) => (
                  <FilaMovimiento
                    key={m.id}
                    movimiento={m}
                    conCliente
                    onClick={() => navigate(RUTAS.ficha(m.cliente_id))}
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
