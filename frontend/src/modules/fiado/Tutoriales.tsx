import { linkDeVideo, tutorialesApi } from '../../host/tutoriales';
import { IconChevron, IconPlay } from '../../host/ui/icons';
import { FOCUS_RING } from '../../host/ui/styles';
import { Section } from '../../host/ui/surfaces';
import { useCarga } from './useCarga';

/**
 * Ajustes → Tutoriales: los videos de YouTube que carga el admin desde el
 * panel. Cada uno abre YouTube en otra pestaña. Si no hay ninguno (o no se
 * pudieron cargar), la sección no aparece.
 */
export function SeccionTutoriales() {
  const carga = useCarga(() => tutorialesApi.listar(), []);
  const tutoriales = carga.data ?? [];
  if (tutoriales.length === 0) return null;

  return (
    <Section title="Tutoriales">
      <p className="m-0 -mt-1 text-body-s text-ink-muted">
        Videos cortos que te enseñan a usar la app.
      </p>
      <ul aria-label="Tutoriales" className="m-0 p-0 list-none rounded-l bg-surface overflow-hidden">
        {tutoriales.map((t) => (
          <li key={t.id} className="border-b border-line last:border-b-0">
            <a
              href={linkDeVideo(t.video_id)}
              target="_blank"
              rel="noopener noreferrer"
              className={`pressable flex items-center gap-3 px-[14px] py-3 min-h-touch no-underline ${FOCUS_RING}`}
            >
              <span
                aria-hidden="true"
                className="flex-none w-10 h-10 rounded-pill bg-fiado text-surface inline-flex items-center justify-center"
              >
                <IconPlay size={22} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-body font-bold text-ink">{t.titulo}</span>
                <span className="block text-caption text-ink-muted">Ver el video</span>
              </span>
              <span aria-hidden="true" className="flex-none text-ink-muted">
                <IconChevron size={20} />
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}
