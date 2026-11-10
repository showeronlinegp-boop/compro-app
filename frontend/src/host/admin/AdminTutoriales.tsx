import { type FormEvent, useEffect, useState } from 'react';
import { type Tutorial, linkDeVideo, tutorialesApi } from '../tutoriales';
import { Button } from '../ui/Button';
import { TextField } from '../ui/controls';
import { Card, EmptyNote, List, ListRow, Notice, Section } from '../ui/surfaces';

/** "400 {"message":"…"}" → "…"; si no se entiende, un mensaje genérico. */
function motivo(err: unknown): string {
  const texto = err instanceof Error ? err.message : '';
  const json = texto.slice(texto.indexOf('{'));
  try {
    const cuerpo = JSON.parse(json) as { message?: unknown; error?: unknown };
    const m = cuerpo.message ?? cuerpo.error;
    if (typeof m === 'string' && m) return m;
  } catch {
    // no era JSON
  }
  return 'No se pudo guardar. Probá de nuevo.';
}

/**
 * Panel → Tutoriales: los videos de YouTube que ven los comercios en
 * Ajustes → Tutoriales. Se agregan pegando el link; se ven en el orden en que
 * se cargaron.
 */
export function AdminTutoriales() {
  const [lista, setLista] = useState<Tutorial[] | null>(null);
  const [titulo, setTitulo] = useState('');
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    tutorialesApi
      .listar()
      .then(setLista)
      .catch(() => setLista([]));
  }, []);

  async function agregar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const nuevo = await tutorialesApi.crear(titulo.trim(), link.trim());
      setLista((l) => [...(l ?? []), nuevo]);
      setTitulo('');
      setLink('');
    } catch (err) {
      setError(motivo(err));
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(t: Tutorial) {
    if (!window.confirm(`¿Borrar "${t.titulo}"? Los comercios dejan de verlo.`)) return;
    try {
      await tutorialesApi.borrar(t.id);
      setLista((l) => (l ?? []).filter((x) => x.id !== t.id));
    } catch (err) {
      setError(motivo(err));
    }
  }

  return (
    <Section title="Tutoriales">
      <p className="m-0 -mt-1 text-body-s text-ink-muted">
        Los ven todos los comercios en Ajustes → Tutoriales.
      </p>
      <Card>
        <form onSubmit={agregar} className="flex flex-col gap-4" noValidate>
          <TextField
            label="Título"
            value={titulo}
            maxLength={80}
            placeholder="Ej.: Cómo anotar un fiado"
            onChange={(e) => setTitulo(e.target.value)}
          />
          <TextField
            label="Link de YouTube"
            value={link}
            inputMode="url"
            autoCapitalize="none"
            placeholder="https://youtu.be/…"
            onChange={(e) => setLink(e.target.value)}
          />
          {error && <Notice>{error}</Notice>}
          <Button
            type="submit"
            variant="primary"
            size="m"
            block
            disabled={guardando || !titulo.trim() || !link.trim()}
          >
            {guardando ? 'Guardando…' : 'Agregar tutorial'}
          </Button>
        </form>
      </Card>
      <List label="Tutoriales cargados">
        {lista === null ? (
          <li>
            <EmptyNote>Cargando…</EmptyNote>
          </li>
        ) : lista.length === 0 ? (
          <li>
            <EmptyNote>Todavía no cargaste tutoriales.</EmptyNote>
          </li>
        ) : (
          lista.map((t) => (
            <ListRow
              key={t.id}
              title={t.titulo}
              subtitle={linkDeVideo(t.video_id)}
              action={
                <Button variant="text" size="s" onClick={() => borrar(t)}>
                  Borrar
                </Button>
              }
            />
          ))
        )}
      </List>
    </Section>
  );
}
