import { useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ScreenHeader } from '../../../host/ui/ScreenHeader';
import { useToast } from '../../../host/ui/Toast';
import { FormCliente } from '../FormCliente';
import { fiadoApi } from '../api';
import { RUTAS, conCliente, esRutaDelModulo } from '../rutas';
import { useCarga } from '../useCarga';
import { nuevaClave } from './Anotar';

/**
 * Alta de cliente (pantalla de tarea, sin barra inferior). Acepta
 * `?nombre=` para venir desde "Crear cliente nuevo" con lo ya tipeado y
 * `?siguiente=` (ruta de Anotar) para volver ahí con el cliente ya elegido.
 * Sin `siguiente`, abre la ficha del cliente nuevo.
 *
 * "¿Ya te debe algo?" pasa la deuda del cuaderno en un solo paso. Con
 * recargos prendidos no aparece: antes del primer fiado hay que avisarle las
 * condiciones, y eso se hace desde la ficha.
 */
export default function NuevoCliente() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const ajustes = useCarga(() => fiadoApi.ajustes(), []);
  const clave = useRef(nuevaClave());

  return (
    <div className="flex flex-col gap-5 px-4 pt-4 pb-6">
      <ScreenHeader variant="task" title="Nuevo cliente" backTo={RUTAS.clientes} />
      <FormCliente
        inicial={{ nombre: params.get('nombre') ?? '' }}
        textoBoton="Guardar cliente"
        conContactos
        conSaldoInicial={ajustes.data != null && ajustes.data.recargo === null}
        onGuardar={async (datos) => {
          const c = await fiadoApi.crearCliente(
            datos.saldo_inicial ? { ...datos, idempotency_key: clave.current } : datos,
          );
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
