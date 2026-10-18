import { useNavigate } from 'react-router-dom';
import { ScreenHeader } from '../../../host/ui/ScreenHeader';
import { formatMoney } from '../../../host/ui/format';
import { Avatar, EmptyNote, List, ListRow, Pill, Section } from '../../../host/ui/surfaces';
import { type Aviso, fiadoApi } from '../api';
import { BotonRecordar, Cargando, ErrorCarga } from '../components';
import { RUTAS } from '../rutas';
import { textoVence } from '../textos';
import { useCarga } from '../useCarga';
import { hoyAR } from '../vence';

/**
 * Avisos de la campanita (nota de prueba #3): fiados vencidos, que vencen hoy
 * y los de los próximos días, por cliente. Cada fila abre la ficha y lleva a
 * "Recordar pago".
 */
export default function Avisos() {
  const navigate = useNavigate();
  const carga = useCarga(() => fiadoApi.avisos(), []);
  const hoy = hoyAR();
  const a = carga.data;

  const grupo = (titulo: string, avisos: Aviso[], tono: 'late' | 'warn' | 'neutral') => (
    <Section
      title={titulo}
      aside={avisos.length > 0 ? <Pill tone={tono}>{avisos.length}</Pill> : undefined}
    >
      <List label={titulo}>
        {avisos.map((x) => (
          <ListRow
            key={x.cliente_id}
            onClick={() => navigate(RUTAS.ficha(x.cliente_id))}
            leading={<Avatar name={x.cliente_nombre} />}
            title={x.cliente_nombre}
            subtitle={
              <span>
                {formatMoney(x.monto)} ·{' '}
                <span className={tono === 'late' ? 'text-late font-bold' : ''}>
                  {textoVence(x.fecha, hoy)}
                </span>
              </span>
            }
            action={
              <BotonRecordar
                recordado={x.recordado_hoy}
                onRecordar={() => navigate(RUTAS.recordar(x.cliente_id))}
              />
            }
          />
        ))}
      </List>
    </Section>
  );

  const vacio = a && a.vencidos.length + a.hoy.length + a.proximos.length === 0;

  return (
    <div className="flex flex-col gap-5 px-4 pt-4 pb-6">
      <ScreenHeader variant="task" title="Avisos" backTo={RUTAS.inicio} />

      {carga.error && !a && <ErrorCarga mensaje={carga.error} onReintentar={carga.recargar} />}
      {!a && !carga.error && <Cargando />}

      {vacio && <EmptyNote>No tenés cobros vencidos ni por vencer esta semana.</EmptyNote>}
      {a && a.vencidos.length > 0 && grupo('Vencidos', a.vencidos, 'late')}
      {a && a.hoy.length > 0 && grupo('Vencen hoy', a.hoy, 'warn')}
      {a && a.proximos.length > 0 && grupo('Próximos 7 días', a.proximos, 'neutral')}
    </div>
  );
}
