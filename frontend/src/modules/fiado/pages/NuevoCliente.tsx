import { type FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../../host/ui/Button';
import { ScreenHeader } from '../../../host/ui/ScreenHeader';
import { useToast } from '../../../host/ui/Toast';
import { TextField } from '../../../host/ui/controls';
import { Notice } from '../../../host/ui/surfaces';
import { fiadoApi, mensajeDeError } from '../api';
import { RUTAS } from '../rutas';

/**
 * Alta de cliente (pantalla de tarea, sin barra inferior). Acepta
 * `?nombre=` para venir desde "Crear cliente nuevo" con lo ya tipeado y
 * `?volver=1` para regresar a la pantalla de origen en vez de abrir la ficha.
 */
export default function NuevoCliente() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const [nombre, setNombre] = useState(params.get('nombre') ?? '');
  const [telefono, setTelefono] = useState('');
  const [limite, setLimite] = useState('');
  const [proximoCobro, setProximoCobro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listo = nombre.trim().length > 0 && !enviando;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!listo) return;
    setEnviando(true);
    setError(null);
    try {
      const c = await fiadoApi.crearCliente({
        nombre: nombre.trim(),
        telefono: telefono.trim() || null,
        limite: limite ? Number(limite) : null,
        proximo_cobro: proximoCobro || null,
      });
      toast.show(`Guardaste a ${c.nombre}.`);
      if (params.get('volver') === '1') {
        navigate(-1);
      } else {
        navigate(RUTAS.ficha(c.id), { replace: true });
      }
    } catch (err) {
      setError(mensajeDeError(err));
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-5 px-4 pt-4 pb-6" noValidate>
      <ScreenHeader variant="task" title="Nuevo cliente" backTo={RUTAS.clientes} />

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
      <TextField
        label="Próximo cobro (opcional)"
        type="date"
        value={proximoCobro}
        onChange={(e) => setProximoCobro(e.target.value)}
        hint="Ese día aparece en “Para cobrar hoy”."
      />

      {error && <Notice>{error}</Notice>}

      <Button type="submit" variant="primary" size="l" block disabled={!listo}>
        {enviando ? 'Guardando…' : 'Guardar cliente'}
      </Button>
    </form>
  );
}
