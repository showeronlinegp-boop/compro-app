import { type FormEvent, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../host/ui/Button';
import { TextField } from '../../../host/ui/controls';
import { useToast } from '../../../host/ui/Toast';
import { Notice } from '../../../host/ui/surfaces';
import { soloDigitos } from '../FormCliente';
import { fiadoApi, mensajeDeError } from '../api';
import { RUTAS } from '../rutas';
import { useCarga } from '../useCarga';
import { nuevaClave } from './Anotar';

const KEY_SALTEADA = 'neggo.fiado-bienvenida-salteada';

/** "Lo hago después": no volver a mandar a la bienvenida mientras dure esta visita. */
export function bienvenidaSalteada(): boolean {
  try {
    return window.sessionStorage.getItem(KEY_SALTEADA) === '1';
  } catch {
    return false;
  }
}

function saltearBienvenida() {
  try {
    window.sessionStorage.setItem(KEY_SALTEADA, '1');
  } catch {
    // Sin almacenamiento: se vuelve a ofrecer al volver al Inicio.
  }
}

/**
 * Bienvenida guiada (plan de adopción, fase 1): la primera vez, el Inicio
 * manda acá a un comercio sin nombre y sin clientes. Tres preguntas y queda
 * con su primer cliente y lo que le debe, sin pasar por Ajustes ni Clientes.
 * "Lo hago después" vuelve al Inicio y no insiste en esta visita (si sigue
 * sin clientes, se ofrece de nuevo la próxima vez que abra la app).
 */
export default function Bienvenida() {
  const navigate = useNavigate();
  const toast = useToast();
  const ajustes = useCarga(() => fiadoApi.ajustes(), []);
  const clave = useRef(nuevaClave());
  const [comercio, setComercio] = useState('');
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [monto, setMonto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Con recargos prendidos (raro en un comercio nuevo), el primer fiado
  // necesita el aviso de condiciones: se carga el cliente sin saldo.
  const conMonto = ajustes.data?.recargo == null;
  const listo = comercio.trim().length > 0 && nombre.trim().length > 0 && !enviando;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!listo) return;
    setEnviando(true);
    setError(null);
    try {
      await fiadoApi.guardarAjustes({ comercio: comercio.trim() });
      const saldo = conMonto ? Number(monto) : 0;
      const c = await fiadoApi.crearCliente({
        nombre: nombre.trim(),
        telefono: telefono.trim() || null,
        ...(saldo > 0 ? { saldo_inicial: saldo, idempotency_key: clave.current } : {}),
      });
      toast.show(`Listo, ya anotaste a ${c.nombre}.`);
      navigate(RUTAS.inicio, { replace: true });
    } catch (err) {
      setError(mensajeDeError(err));
      setEnviando(false);
    }
  }

  function despues() {
    saltearBienvenida();
    navigate(RUTAS.inicio, { replace: true });
  }

  return (
    <div className="flex flex-col gap-6 px-4 pt-8 pb-6">
      <header className="flex flex-col gap-2">
        <h1 className="m-0 font-display text-title-l text-ink">Arranquemos</h1>
        <p className="m-0 text-body text-ink-muted">
          Tres preguntas y ya tenés tu primer cliente anotado.
        </p>
      </header>

      <form onSubmit={guardar} className="flex flex-col gap-5" noValidate>
        <TextField
          label="¿Cómo se llama tu comercio?"
          labelTone="question"
          autoComplete="organization"
          autoCapitalize="words"
          placeholder="Kiosco Lu"
          value={comercio}
          onChange={(e) => setComercio(e.target.value)}
          maxLength={60}
          required
        />
        <TextField
          label="¿Quién te debe más?"
          labelTone="question"
          autoComplete="off"
          autoCapitalize="words"
          placeholder="Nombre del cliente"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          maxLength={80}
          required
        />
        <TextField
          label="Su teléfono (opcional)"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="11 1234-5678"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          hint="Para mandarle el comprobante por WhatsApp."
        />
        {conMonto && (
          <TextField
            label="¿Cuánto te debe hoy?"
            labelTone="question"
            inputMode="numeric"
            placeholder="$ 0"
            value={monto}
            onChange={(e) => setMonto(soloDigitos(e.target.value))}
            hint="Lo que tenés anotado en el cuaderno. Queda como “Saldo anterior”."
          />
        )}

        {error && <Notice>{error}</Notice>}

        <div className="flex flex-col gap-2">
          <Button type="submit" variant="primary" size="l" block disabled={!listo}>
            {enviando ? 'Guardando…' : 'Listo, empezar'}
          </Button>
          <Button type="button" variant="text" size="m" block onClick={despues}>
            Lo hago después
          </Button>
        </div>
      </form>
    </div>
  );
}
