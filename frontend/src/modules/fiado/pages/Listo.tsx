import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Button } from '../../../host/ui/Button';
import { useGoBack } from '../../../host/ui/ScreenHeader';
import { useToast } from '../../../host/ui/Toast';
import { formatMoney } from '../../../host/ui/format';
import { IconCheck } from '../../../host/ui/icons';
import { Card, Notice } from '../../../host/ui/surfaces';
import { fiadoApi, mensajeDeError } from '../api';
import { RUTAS } from '../rutas';
import { primerNombre, textoSaldo } from '../textos';
import type { EstadoListo } from './Anotar';

/** Más tiempo que un toast común: tiene que alcanzar para tocar "Deshacer". */
const DESHACER_MS = 8000;

/**
 * Confirmación después de anotar (pantalla de tarea). Ofrece "Deshacer" en un
 * toast: no borra nada, crea una corrección que queda visible en el historial.
 * El toast vive mientras se ve esta pantalla: al salir se cierra, así
 * "Deshacer" nunca actúa desde otra pantalla.
 */
export default function Listo() {
  const location = useLocation();
  const estado = location.state as EstadoListo | null;
  const volver = useGoBack(RUTAS.inicio);
  const toast = useToast();

  // biome-ignore lint/correctness/useExhaustiveDependencies: se ofrece una sola vez por movimiento
  useEffect(() => {
    if (!estado) return;
    // Si el usuario ya salió de "Listo" cuando vuelve la respuesta, no navegar otra vez.
    let enPantalla = true;
    const { movimiento } = estado.resultado;
    const id = toast.show(
      `${estado.tipo === 'fiado' ? 'Anotaste' : 'Registraste'} ${formatMoney(movimiento.monto)}.`,
      {
        durationMs: DESHACER_MS,
        action: {
          label: 'Deshacer',
          onClick: () => {
            fiadoApi
              .corregir(movimiento.id)
              .then(() => {
                toast.show('Listo, lo deshicimos. Queda anotado en el historial como corrección.');
                if (enPantalla) volver();
              })
              .catch((err) => toast.show(mensajeDeError(err)));
          },
        },
      },
    );
    return () => {
      enPantalla = false;
      toast.dismiss(id);
    };
  }, []);

  // Entrada directa o recarga: no hay nada que confirmar.
  if (!estado) return <Navigate to={RUTAS.inicio} replace />;

  const { tipo, resultado } = estado;
  const { cliente, movimiento } = resultado;
  const nombre = primerNombre(cliente.nombre);
  const frase =
    tipo === 'fiado'
      ? `Anotaste ${formatMoney(movimiento.monto)} de fiado a ${nombre}.`
      : `${nombre} pagó ${formatMoney(movimiento.monto)}.`;

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

      <Button variant="soft" size="l" block onClick={volver}>
        Terminar
      </Button>
    </div>
  );
}
