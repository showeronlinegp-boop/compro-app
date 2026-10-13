import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../host/ui/Button';
import { ScreenHeader } from '../../../host/ui/ScreenHeader';
import { FilterChips, TextField } from '../../../host/ui/controls';
import { IconPlus } from '../../../host/ui/icons';
import { EmptyNote, List } from '../../../host/ui/surfaces';
import { type OrdenClientes, fiadoApi } from '../api';
import { Cargando, ErrorCarga, FilaCliente } from '../components';
import { RUTAS } from '../rutas';
import { useCarga } from '../useCarga';

const ORDENES: { value: OrdenClientes; label: string }[] = [
  { value: 'deuda', label: 'Más deuda' },
  { value: 'dias', label: 'Más días sin pagar' },
  { value: 'az', label: 'A a Z' },
];

/** Espera a que el usuario deje de tipear antes de buscar. */
function useDebounced(value: string, ms = 250): string {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Lista de clientes con buscador y orden (guía §5 del mockup). */
export default function Clientes() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [orden, setOrden] = useState<OrdenClientes>('deuda');
  const busqueda = useDebounced(q);
  const carga = useCarga(() => fiadoApi.clientes(busqueda, orden), [busqueda, orden]);

  return (
    <div className="flex flex-col gap-5 px-4 py-6">
      <ScreenHeader
        variant="place"
        title="Clientes"
        action={
          <Button
            variant="primary"
            size="s"
            icon={<IconPlus size={20} />}
            onClick={() => navigate(RUTAS.nuevoCliente())}
          >
            Nuevo
          </Button>
        }
      />

      <TextField
        label="Buscar"
        type="search"
        inputMode="search"
        placeholder="Buscá por nombre"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <FilterChips label="Ordenar por" options={ORDENES} value={orden} onChange={setOrden} />

      {carga.error && !carga.data && (
        <ErrorCarga mensaje={carga.error} onReintentar={carga.recargar} />
      )}
      {!carga.data && !carga.error && <Cargando />}

      {carga.data && (
        <List label="Clientes">
          {carga.data.length === 0 ? (
            <li>
              <EmptyNote>
                {busqueda ? 'No hay clientes con ese nombre.' : 'Todavía no anotaste clientes.'}
              </EmptyNote>
            </li>
          ) : (
            carga.data.map((c) => (
              <FilaCliente key={c.id} cliente={c} onClick={() => navigate(RUTAS.ficha(c.id))} />
            ))
          )}
        </List>
      )}
    </div>
  );
}
