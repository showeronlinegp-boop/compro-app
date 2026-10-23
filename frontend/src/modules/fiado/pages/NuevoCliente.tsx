import { useNavigate, useSearchParams } from 'react-router-dom';
import { ScreenHeader } from '../../../host/ui/ScreenHeader';
import { useToast } from '../../../host/ui/Toast';
import { FormCliente } from '../FormCliente';
import { fiadoApi } from '../api';
import { RUTAS, conCliente, esRutaDelModulo } from '../rutas';

/**
 * Alta de cliente (pantalla de tarea, sin barra inferior). Acepta
 * `?nombre=` para venir desde "Crear cliente nuevo" con lo ya tipeado y
 * `?siguiente=` (ruta de Anotar) para volver ahí con el cliente ya elegido.
 * Sin `siguiente`, abre la ficha del cliente nuevo.
 */
export default function NuevoCliente() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();

  return (
    <div className="flex flex-col gap-5 px-4 pt-4 pb-6">
      <ScreenHeader variant="task" title="Nuevo cliente" backTo={RUTAS.clientes} />
      <FormCliente
        inicial={{ nombre: params.get('nombre') ?? '' }}
        textoBoton="Guardar cliente"
        onGuardar={async (datos) => {
          const c = await fiadoApi.crearCliente(datos);
          toast.show(`Guardaste a ${c.nombre}.`);
          const siguiente = params.get('siguiente');
          navigate(esRutaDelModulo(siguiente) ? conCliente(siguiente, c.id) : RUTAS.ficha(c.id), {
            replace: true,
          });
        }}
      />
    </div>
  );
}
