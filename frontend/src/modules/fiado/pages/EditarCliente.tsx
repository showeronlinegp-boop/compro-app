import { useParams } from 'react-router-dom';
import { ScreenHeader, useGoBack } from '../../../host/ui/ScreenHeader';
import { useToast } from '../../../host/ui/Toast';
import { FormCliente } from '../FormCliente';
import { fiadoApi } from '../api';
import { Cargando, ErrorCarga } from '../components';
import { RUTAS } from '../rutas';
import { useCarga } from '../useCarga';

/**
 * Corregir los datos de un cliente (nombre, teléfono, límite y, con recargos
 * activos, "No sugerir recargos a este cliente"). Vaciar el
 * teléfono o el límite los saca. Al guardar vuelve a la ficha (que recarga).
 */
export default function EditarCliente() {
  const { id } = useParams();
  const clienteId = Number(id);
  const volver = useGoBack(RUTAS.ficha(clienteId));
  const toast = useToast();
  const carga = useCarga(
    () => Promise.all([fiadoApi.ficha(clienteId), fiadoApi.ajustes()]),
    [clienteId],
  );
  const [ficha, ajustes] = carga.data ?? [null, null];
  const c = ficha?.cliente;

  return (
    <div className="flex flex-col gap-5 px-4 pt-4 pb-6">
      <ScreenHeader variant="task" title="Editar datos" backTo={RUTAS.ficha(clienteId)} />

      {carga.error && !c && <ErrorCarga mensaje={carga.error} onReintentar={carga.recargar} />}
      {!c && !carga.error && <Cargando />}

      {c && (
        <FormCliente
          inicial={c}
          conRecargo={ajustes?.recargo != null || c.sin_recargo}
          textoBoton="Guardar cambios"
          onGuardar={async (datos) => {
            const actualizado = await fiadoApi.actualizarCliente(clienteId, datos);
            toast.show(`Guardaste los datos de ${actualizado.nombre}.`);
            volver();
          }}
        />
      )}
    </div>
  );
}
