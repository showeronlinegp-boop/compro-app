import { useNavigate } from 'react-router-dom';
import { TarjetaInstalar } from '../../../host/install/InstalarApp';
import { IconBell } from '../../../host/ui/icons';
import { FOCUS_RING } from '../../../host/ui/styles';
import { EmptyNote, List, Pill, Section } from '../../../host/ui/surfaces';
import { fiadoApi } from '../api';
import {
  AccionesMovimiento,
  Cargando,
  ErrorCarga,
  FilaCobro,
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
 * acciones rápidas, "Para cobrar hoy", tarjeta Neggo y últimos movimientos.
 */
export default function Inicio() {
  const navigate = useNavigate();
  const carga = useCarga(() => Promise.all([fiadoApi.resumen(), fiadoApi.ajustes()]), []);

  // La campanita carga aparte: si falla, el inicio se ve igual (sin número).
  const avisos = useCarga(() => fiadoApi.avisos(), []);

  const [resumen, ajustes] = carga.data ?? [null, null];
  const sinRecordar = avisos.data?.sin_recordar ?? 0;

  return (
    <div className="flex flex-col gap-5 px-4 py-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-body text-ink-muted">{ajustes?.comercio || 'Tu comercio'}</p>
          <h1 className="m-0 font-display text-title-m font-bold text-ink">{saludo()}</h1>
        </div>
        <button
          type="button"
          onClick={() => navigate(RUTAS.avisos)}
          aria-label={sinRecordar > 0 ? `Avisos: ${sinRecordar} para cobrar` : 'Avisos'}
          className={`pressable relative flex-none inline-flex items-center justify-center min-h-touch min-w-touch rounded-pill bg-surface text-ink border-[1.5px] border-border ${FOCUS_RING}`}
        >
          <IconBell />
          {sinRecordar > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-[6px] rounded-pill bg-late text-surface text-micro font-bold inline-flex items-center justify-center"
            >
              {sinRecordar > 99 ? '99+' : sinRecordar}
            </span>
          )}
        </button>
      </header>

      {carga.error && !resumen && (
        <ErrorCarga mensaje={carga.error} onReintentar={carga.recargar} />
      )}
      {!resumen && !carga.error && <Cargando />}

      {resumen && (
        <>
          <TarjetaTeDeben total={resumen.total} clientes={resumen.clientes_con_deuda} />

          <AccionesMovimiento onAnotar={(tipo) => navigate(RUTAS.anotar(tipo))} />

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
                  <FilaCobro
                    key={c.id}
                    cobro={c}
                    onAbrir={() => navigate(RUTAS.ficha(c.id))}
                    onRecordar={() => navigate(RUTAS.recordar(c.id))}
                  />
                ))
              )}
            </List>
          </Section>

          {NEGGO_URL && <TarjetaNeggo href={NEGGO_URL} />}

          <TarjetaInstalar />

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
