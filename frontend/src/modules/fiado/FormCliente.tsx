import { type FormEvent, useState } from 'react';
import { Button } from '../../host/ui/Button';
import { TextField } from '../../host/ui/controls';
import { Notice } from '../../host/ui/surfaces';
import { mensajeDeError } from './api';

export interface DatosCliente {
  nombre: string;
  telefono: string | null;
  limite: number | null;
}

/**
 * Campos de un cliente (nombre, teléfono, límite), compartidos por el alta y
 * la edición. `onGuardar` recibe los datos ya limpios; si falla, se muestra
 * el error del backend y se puede reintentar.
 */
export function FormCliente({
  inicial,
  textoBoton,
  onGuardar,
}: {
  inicial: { nombre?: string; telefono?: string | null; limite?: number | null };
  textoBoton: string;
  onGuardar: (datos: DatosCliente) => Promise<void>;
}) {
  const [nombre, setNombre] = useState(inicial.nombre ?? '');
  const [telefono, setTelefono] = useState(inicial.telefono ?? '');
  const [limite, setLimite] = useState(inicial.limite != null ? String(inicial.limite) : '');
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
      });
    } catch (err) {
      setError(mensajeDeError(err));
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-5" noValidate>
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
        onChange={(e) => setLimite(e.target.value.replace(/\D/g, '').slice(0, 9))}
        hint="Si lo pasa, te avisamos. No te frena para anotar."
      />

      {error && <Notice>{error}</Notice>}

      <Button type="submit" variant="primary" size="l" block disabled={!listo}>
        {enviando ? 'Guardando…' : textoBoton}
      </Button>
    </form>
  );
}
