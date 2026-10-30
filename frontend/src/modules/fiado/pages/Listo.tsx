import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Button } from '../../../host/ui/Button';
import { useGoBack } from '../../../host/ui/ScreenHeader';
import { useToast } from '../../../host/ui/Toast';
import { formatMoney } from '../../../host/ui/format';
import { IconCheck } from '../../../host/ui/icons';
import { Card, Notice, WhatsAppBubble } from '../../../host/ui/surfaces';
import { registrarUso } from '../../../host/uso';
import { type Movimiento, fiadoApi, mensajeDeError } from '../api';
import { abrirWhatsApp, comprobante, comprobanteRecargos } from '../mensajes';
import type { EstadoListoRecargo } from '../recargos';
import { RUTAS } from '../rutas';
import { primerNombre, textoSaldo } from '../textos';
import { useCarga } from '../useCarga';
import type { EstadoListo } from './Anotar';

/** Más tiempo que un toast común: tiene que alcanzar para tocar "Deshacer". */
const DESHACER_MS = 8000;

/**
 * Confirmación después de anotar un fiado o un pago, o de sumar recargos
 * (pantalla de tarea). Ofrece "Deshacer" en un
 * toast: no borra nada, crea una corrección que queda visible en el historial.
 * El toast vive mientras se ve esta pantalla: al salir se cierra, así
 * "Deshacer" nunca actúa desde otra pantalla.
 */
export default function Listo() {
  const location = useLocation();
  const estado = location.state as EstadoListo | EstadoListoRecargo | null;
  const volver = useGoBack(RUTAS.inicio);
  const toast = useToast();
  const ajustes = useCarga(() => fiadoApi.ajustes(), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: se ofrece una sola vez por movimiento
  useEffect(() => {
    if (!estado) return;
    // Si el usuario ya salió de "Listo" cuando vuelve la respuesta, no navegar otra vez.
    let enPantalla = true;
    const movs = movimientosDe(estado);
    const total = movs.reduce((acc, m) => acc + Math.abs(m.monto), 0);
    const texto =
      estado.tipo === 'recargo'
        ? `Sumaste ${formatMoney(total)} de ${movs.length === 1 ? 'recargo' : 'recargos'}.`
        : `${estado.tipo === 'fiado' ? 'Anotaste' : 'Registraste'} ${formatMoney(total)}.`;
    const id = toast.show(texto, {
      durationMs: DESHACER_MS,
      action: {
        label: 'Deshacer',
        onClick: () => {
          // Con varios recargos, se deshace cada uno (cada uno es su fila).
          movs
            .reduce<Promise<unknown>>(
              (cadena, m) => cadena.then(() => fiadoApi.corregir(m.id)),
              Promise.resolve(),
            )
            .then(() => {
              toast.show('Listo, lo deshicimos. Queda anotado en el historial como corrección.');
              if (enPantalla) volver();
            })
            .catch((err) => toast.show(mensajeDeError(err)));
        },
      },
    });
    return () => {
      enPantalla = false;
      toast.dismiss(id);
    };
  }, []);

  // Entrada directa o recarga: no hay nada que confirmar.
  if (!estado) return <Navigate to={RUTAS.inicio} replace />;

  const { cliente } = estado.resultado;
  const movs = movimientosDe(estado);
  const total = movs.reduce((acc, m) => acc + Math.abs(m.monto), 0);
  const nombre = primerNombre(cliente.nombre);
  const frase =
    estado.tipo === 'recargo'
      ? `Sumaste ${formatMoney(total)} de ${movs.length === 1 ? 'recargo' : 'recargos'} por atraso a ${nombre}.`
      : estado.tipo === 'fiado'
        ? `Anotaste ${formatMoney(total)} de fiado a ${nombre}.`
        : `${nombre} pagó ${formatMoney(total)}.`;
  const textoComprobante = !ajustes.data
    ? ''
    : estado.tipo === 'recargo'
      ? comprobanteRecargos(
          estado.resultado.movimientos.map((m) => ({
            monto: m.monto,
            detalle: m.nota ?? '',
            fiado_fecha: estado.fiados[m.recargo_de ?? 0] ?? '',
          })),
          cliente,
          ajustes.data,
        )
      : comprobante(estado.tipo, total, cliente, ajustes.data, estado.resultado.movimiento.vence);

  return (
    <div className="flex flex-col gap-5 px-4 py-8">
      <div className="flex flex-col items-center text-center gap-3">
        <span className="w-16 h-16 rounded-pill bg-ok-bg text-ok flex items-center justify-center">
          <IconCheck size={34} strokeWidth={2.6} />
        </span>
        <h1 className="m-0 font-display text-title-l text-ink">Listo</h1>
        <p className="m-0 text-body-l text-ink">{frase}</p>
      </div>

      <Card>
        <p className="m-0 text-body text-ink-muted">
          {cliente.saldo < 0 ? 'Ahora tiene a favor' : 'Ahora te debe'}
        </p>
        <p className="m-0 font-display text-amount-m text-ink">{textoSaldo(cliente.saldo)}</p>
      </Card>

      {cliente.excede_limite && cliente.limite != null && (
        <Notice>
          {nombre} pasó el límite de {formatMoney(cliente.limite)}. Podés seguir anotando, pero
          conviene cobrarle antes.
        </Notice>
      )}

      {ajustes.data && (
        <>
          <WhatsAppBubble label="Comprobante" text={textoComprobante} />
          <Button
            variant="whatsapp"
            size="l"
            block
            className="min-h-[58px]"
            onClick={() => {
              if (!ajustes.data) return;
              abrirWhatsApp(cliente.whatsapp, textoComprobante);
              registrarUso('comprobante', 'fiado');
              volver();
            }}
          >
            Enviar por WhatsApp
          </Button>
        </>
      )}

      <Button variant="soft" size="m" block onClick={volver}>
        Ahora no
      </Button>
    </div>
  );
}

/** Los movimientos recién anotados: uno (fiado o pago) o varios (recargos). */
function movimientosDe(estado: EstadoListo | EstadoListoRecargo): Movimiento[] {
  return estado.tipo === 'recargo' ? estado.resultado.movimientos : [estado.resultado.movimiento];
}
