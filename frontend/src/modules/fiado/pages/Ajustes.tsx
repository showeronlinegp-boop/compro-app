import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Button } from '../../../host/ui/Button';
import { ScreenHeader } from '../../../host/ui/ScreenHeader';
import { useToast } from '../../../host/ui/Toast';
import { TextArea, TextField } from '../../../host/ui/controls';
import { Card, Notice, Section } from '../../../host/ui/surfaces';
import { type BorradorRecargo, SeccionRecargo, borradorDe, configDe } from '../AjustesRecargo';
import { DialogoTerminosRecargo } from '../TerminosRecargo';
import { type Ajustes as AjustesData, fiadoApi, mensajeDeError } from '../api';
import { Cargando, ErrorCarga } from '../components';
import { ETIQUETA_VARIABLE, FIRMA, VARIABLES, type Variable, insertarVariable } from '../mensajes';
import { useCarga } from '../useCarga';

type Plantilla = 'plantilla_fiado' | 'plantilla_pago' | 'plantilla_recordatorio';

const PLANTILLAS: { campo: Plantilla; label: string; vars: readonly Variable[] }[] = [
  { campo: 'plantilla_fiado', label: 'Comprobante de fiado', vars: VARIABLES.fiado },
  { campo: 'plantilla_pago', label: 'Comprobante de pago', vars: VARIABLES.pago },
  { campo: 'plantilla_recordatorio', label: 'Recordatorio', vars: VARIABLES.recordatorio },
];

/** Ajustes de Fiado: datos del comercio, aviso de deuda vieja, recargo por atraso y mensajes. */
export default function Ajustes() {
  const carga = useCarga(() => fiadoApi.ajustes(), []);
  const toast = useToast();
  const [form, setForm] = useState<AjustesData | null>(null);
  const [dias, setDias] = useState('');
  const [recargo, setRecargo] = useState<BorradorRecargo>(() => borradorDe(null));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Aceptó los términos del recargo en esta pantalla (se mandan al guardar). */
  const [aceptoTerminos, setAceptoTerminos] = useState(false);
  /** El diálogo de términos abierto: al prender el interruptor o al guardar. */
  const [pideTerminos, setPideTerminos] = useState<null | 'activar' | 'guardar'>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (carga.data) {
      setForm(carga.data);
      setDias(String(carga.data.dias_deuda_vieja));
      setRecargo(borradorDe(carga.data.recargo));
    }
  }, [carga.data]);

  const textareas = useRef<Partial<Record<Plantilla, HTMLTextAreaElement | null>>>({});

  const set = <K extends keyof AjustesData>(k: K, v: AjustesData[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  /** Suma `{variable}` donde está el cursor (o al final) y deja el cursor después. */
  function agregarVariable(campo: Plantilla, variable: Variable) {
    if (!form) return;
    const el = textareas.current[campo];
    const texto = form[campo];
    const inicio = el?.selectionStart ?? texto.length;
    const fin = el?.selectionEnd ?? texto.length;
    const r = insertarVariable(texto, variable, inicio, fin);
    if (r.texto.length > 1000) return;
    set(campo, r.texto);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(r.cursor, r.cursor);
    });
  }

  const faltanTerminos = () => form !== null && !form.recargo_terminos_aceptados && !aceptoTerminos;

  /** Prender el interruptor pide aceptar los términos (si todavía no los aceptó). */
  function cambiarRecargo(b: BorradorRecargo) {
    if (b.activo && !recargo.activo && faltanTerminos()) {
      setPideTerminos('activar');
      return;
    }
    setRecargo(b);
  }

  function aceptarTerminos() {
    setAceptoTerminos(true);
    const motivo = pideTerminos;
    setPideTerminos(null);
    if (motivo === 'activar') setRecargo((b) => ({ ...b, activo: true }));
    // Si fue al guardar, se vuelve a enviar el formulario ya con la aceptación.
    else requestAnimationFrame(() => formRef.current?.requestSubmit());
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    // Términos nuevos (o nunca aceptados) con los recargos prendidos: primero aceptarlos.
    if (recargo.activo && faltanTerminos()) {
      setPideTerminos('guardar');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const guardado = await fiadoApi.guardarAjustes({
        comercio: form.comercio.trim(),
        alias: form.alias?.trim() || null,
        dias_deuda_vieja: Number(dias),
        plantilla_fiado: form.plantilla_fiado,
        plantilla_pago: form.plantilla_pago,
        plantilla_recordatorio: form.plantilla_recordatorio,
        recargo: configDe(recargo),
        ...(aceptoTerminos && recargo.activo
          ? { terminos_recargo: form.recargo_terminos_version }
          : {}),
      });
      const hayQueAvisar =
        guardado.recargo !== null && guardado.recargo_version > form.recargo_version;
      setForm(guardado);
      setDias(String(guardado.dias_deuda_vieja));
      setRecargo(borradorDe(guardado.recargo));
      toast.show(
        hayQueAvisar
          ? 'Guardaste los cambios. Antes de anotarle algo nuevo a cada cliente, te vamos a pedir que le avises las condiciones.'
          : 'Guardaste los cambios.',
      );
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={guardar} className="flex flex-col gap-5 px-4 py-6" noValidate>
      <ScreenHeader variant="place" title="Ajustes" />

      {carga.error && !carga.data && (
        <ErrorCarga mensaje={carga.error} onReintentar={carga.recargar} />
      )}
      {!form && !carga.error && <Cargando />}

      {form && (
        <>
          <Section title="Tu comercio">
            <Card>
              <div className="flex flex-col gap-4">
                <TextField
                  label="Nombre del comercio"
                  value={form.comercio}
                  maxLength={60}
                  onChange={(e) => set('comercio', e.target.value)}
                  hint="Aparece en el inicio y en los mensajes."
                />
                <TextField
                  label="Alias para transferencias"
                  value={form.alias ?? ''}
                  maxLength={60}
                  autoCapitalize="none"
                  onChange={(e) => set('alias', e.target.value)}
                  hint="Va en el recordatorio de pago."
                />
                <TextField
                  label="Aviso de deuda vieja (días)"
                  inputMode="numeric"
                  value={dias}
                  onChange={(e) => setDias(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  hint="Con esos días sin pagar, el cliente aparece en “Para cobrar hoy”."
                />
              </div>
            </Card>
          </Section>

          <SeccionRecargo
            borrador={recargo}
            onChange={cambiarRecargo}
            condiciones={form.recargo_condiciones}
          />

          <Section title="Mensajes">
            <Card>
              <div className="flex flex-col gap-5">
                {PLANTILLAS.map((p) => (
                  <div key={p.campo} className="flex flex-col gap-2">
                    <TextArea
                      ref={(el) => {
                        textareas.current[p.campo] = el;
                      }}
                      label={p.label}
                      value={form[p.campo]}
                      maxLength={1000}
                      onChange={(e) => set(p.campo, e.target.value)}
                      hint={`Tocá un dato para sumarlo al mensaje. Siempre termina con “${FIRMA}”.`}
                    />
                    <fieldset className="m-0 p-0 border-0 min-w-0 flex flex-wrap gap-2">
                      <legend className="sr-only">{`Datos para ${p.label}`}</legend>
                      {p.vars.map((v) => (
                        <Button
                          key={v}
                          variant="soft"
                          size="chip"
                          onClick={() => agregarVariable(p.campo, v)}
                        >
                          + {ETIQUETA_VARIABLE[v]}
                        </Button>
                      ))}
                    </fieldset>
                    <Button
                      variant="text"
                      size="s"
                      className="self-start px-0"
                      onClick={() => set(p.campo, '')}
                    >
                      Volver al mensaje original
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          </Section>

          {error && <Notice>{error}</Notice>}

          <Button type="submit" variant="primary" size="l" block disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </Button>

          <p className="m-0 text-center text-caption text-ink-muted">{FIRMA}</p>

          {pideTerminos && (
            <DialogoTerminosRecargo
              onAceptar={aceptarTerminos}
              onCancelar={() => setPideTerminos(null)}
            />
          )}
        </>
      )}
    </form>
  );
}
