import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '../../../host/ui/Button';
import { ScreenHeader, useGoBack } from '../../../host/ui/ScreenHeader';
import { useToast } from '../../../host/ui/Toast';
import { Card, Notice, WhatsAppBubble } from '../../../host/ui/surfaces';
import { fiadoApi, mensajeDeError } from '../api';
import { Cargando, ErrorCarga } from '../components';
import { abrirWhatsApp, recordatorio } from '../mensajes';
import { RUTAS } from '../rutas';
import { primerNombre, textoDias, textoSaldo } from '../textos';
import { useCarga } from '../useCarga';

/**
 * Recordar pago (pantalla de tarea): vista previa del mensaje y "Abrir
 * WhatsApp". Al abrirlo, el cliente queda marcado como "Recordado" hoy.
 */
export default function Recordar() {
  const { id } = useParams();
  const clienteId = Number(id);
  const toast = useToast();
  const volver = useGoBack(RUTAS.inicio);
  const carga = useCarga(
    () => Promise.all([fiadoApi.ficha(clienteId), fiadoApi.ajustes()]),
    [clienteId],
  );
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ficha, ajustes] = carga.data ?? [null, null];
  const cliente = ficha?.cliente;
  const texto = cliente && ajustes ? recordatorio(cliente, ajustes) : '';

  async function abrir() {
    if (!cliente) return;
    setEnviando(true);
    setError(null);
    // Se abre en el mismo gesto del usuario (si no, el navegador lo bloquea).
    abrirWhatsApp(cliente.whatsapp, texto);
    try {
      await fiadoApi.recordar(cliente.id);
      toast.show(`Listo, le recordaste a ${primerNombre(cliente.nombre)}.`);
      volver();
    } catch (err) {
      setError(mensajeDeError(err));
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 px-4 pt-4 pb-6">
      <ScreenHeader variant="task" title="Recordar pago" backTo={RUTAS.inicio} />

      {carga.error && !carga.data && (
        <ErrorCarga mensaje={carga.error} onReintentar={carga.recargar} />
      )}
      {!carga.data && !carga.error && <Cargando />}

      {cliente && ajustes && (
        <>
          <Card>
            <p className="m-0 text-body font-bold text-ink">{cliente.nombre}</p>
            <p className="m-0 font-display text-amount-m text-ink">{textoSaldo(cliente.saldo)}</p>
            {cliente.dias_sin_pagar != null && (
              <p className="m-0 text-caption text-ink-muted">{textoDias(cliente.dias_sin_pagar)}</p>
            )}
          </Card>

          <p className="m-0 text-body-s text-ink-muted">
            Se abre WhatsApp con este mensaje. Lo podés cambiar antes de mandarlo.
            {!cliente.whatsapp && ' No tenemos un celular válido: vas a elegir el contacto.'}
          </p>

          <WhatsAppBubble text={texto} />

          {error && <Notice>{error}</Notice>}

          <Button
            variant="whatsapp"
            size="l"
            block
            className="min-h-[58px]"
            disabled={enviando}
            onClick={abrir}
          >
            Abrir WhatsApp
          </Button>
        </>
      )}
    </div>
  );
}
