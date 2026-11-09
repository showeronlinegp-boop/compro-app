import { type FormEvent, useState } from 'react';
import { Button } from '../../host/ui/Button';
import { TextField } from '../../host/ui/controls';
import { Notice } from '../../host/ui/surfaces';
import { mensajeDeError } from './api';
import { BotonContactos } from './contactos';
import { Interruptor } from './recargos';

export interface DatosCliente {
  nombre: string;
  telefono: string | null;
  limite: number | null;
  /** Sólo si se muestra la opción de recargos. */
  sin_recargo?: boolean;
  /** Sólo si se muestra "¿Ya te debe algo?" y se completó. */
  saldo_inicial?: number;
}

/** Deja sólo dígitos (hasta $ 999.999.999), como el límite. */
export const soloDigitos = (v: string) => v.replace(/\D/g, '').slice(0, 9);

/**
 * Campos de un cliente (nombre, teléfono, límite), compartidos por el alta y
 * la edición. `onGuardar` recibe los datos ya limpios; si falla, se muestra
 * el error del backend y se puede reintentar.
 */
export function FormCliente({
  inicial,
  textoBoton,
  onGuardar,
  conRecargo = false,
  conSaldoInicial = false,
  conContactos = false,
}: {
  inicial: {
    nombre?: string;
    telefono?: string | null;
    limite?: number | null;
    sin_recargo?: boolean;
  };
  textoBoton: string;
  onGuardar: (datos: DatosCliente) => Promise<void>;
  /** Muestra "No sugerir recargos a este cliente" (recargos activos o ya marcado). */
  conRecargo?: boolean;
  /** Muestra "¿Ya te debe algo?" (sólo en el alta y con recargos apagados). */
  conSaldoInicial?: boolean;
  /** Muestra "Elegir de mis contactos" (sólo en el alta y si el celu lo permite). */
  conContactos?: boolean;
}) {
  const [nombre, setNombre] = useState(inicial.nombre ?? '');
  const [telefono, setTelefono] = useState(inicial.telefono ?? '');
  const [limite, setLimite] = useState(inicial.limite != null ? String(inicial.limite) : '');
  const [sinRecargo, setSinRecargo] = useState(inicial.sin_recargo ?? false);
  const [saldoInicial, setSaldoInicial] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listo = nombre.trim().length > 0 && !enviando;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!listo) return;
    setEnviando(true);
    setError(null);
    try {
      await onGuardar({
        nombre: nombre.trim(),
        telefono: telefono.trim() || null,
        limite: limite ? Number(limite) : null,
        ...(conRecargo ? { sin_recargo: sinRecargo } : {}),
        ...(conSaldoInicial && Number(saldoInicial) > 0
          ? { saldo_inicial: Number(saldoInicial) }
          : {}),
      });
    } catch (err) {
      setError(mensajeDeError(err));
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-5" noValidate>
      {conContactos && (
        <BotonContactos
          onElegir={(c) => {
            if (c.nombre) setNombre(c.nombre);
            if (c.telefono) setTelefono(c.telefono);
          }}
        />
      )}
      <TextField
        label="Nombre"
        labelTone="question"
        autoComplete="off"
        autoCapitalize="words"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        maxLength={80}
        required
      />
      <TextField
        label="Teléfono (opcional)"
        type="tel"
        inputMode="tel"
        autoComplete="off"
        placeholder="11 1234-5678"
        value={telefono}
        onChange={(e) => setTelefono(e.target.value)}
        hint="Para mandarle el comprobante por WhatsApp."
      />
      <TextField
        label="Límite de fiado (opcional)"
        inputMode="numeric"
        placeholder="Sin límite"
        value={limite}
        onChange={(e) => setLimite(soloDigitos(e.target.value))}
        hint="Si lo pasa, te avisamos. No te frena para anotar."
      />

      {conSaldoInicial && (
        <TextField
          label="¿Ya te debe algo? (opcional)"
          inputMode="numeric"
          placeholder="No me debe nada"
          value={saldoInicial}
          onChange={(e) => setSaldoInicial(soloDigitos(e.target.value))}
          hint="Lo que tenés anotado en el cuaderno. Queda como “Saldo anterior”."
        />
      )}

      {conRecargo && (
        <Interruptor
          label="No sugerir recargos a este cliente"
          hint={
            inicial.sin_recargo
              ? 'Si se los volvés a activar, vas a tener que avisarle las condiciones.'
              : 'Para clientes de confianza. Los recargos que ya tiene no cambian.'
          }
          checked={sinRecargo}
          onChange={setSinRecargo}
        />
      )}

      {error && <Notice>{error}</Notice>}

      <Button type="submit" variant="primary" size="l" block disabled={!listo}>
        {enviando ? 'Guardando…' : textoBoton}
      </Button>
    </form>
  );
}
