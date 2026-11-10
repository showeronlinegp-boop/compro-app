/**
 * Tutoriales en video — puro, sin DB ni Nest.
 *
 * El admin pega un link de YouTube y un título; se guarda sólo el id del video
 * (11 caracteres). Así el front arma siempre un link a youtube.com y nadie
 * puede colar otra dirección.
 */

export const TITULO_MAX = 80;

/** Ids de YouTube: 11 caracteres de [A-Za-z0-9_-]. */
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

const HOSTS_YOUTUBE = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);

export interface TutorialInput {
  titulo: string;
  video_id: string;
}

export class TutorialInvalido extends Error {}

/**
 * Id del video a partir de un link de YouTube, o null si no es uno.
 * Acepta youtube.com/watch?v=…, youtu.be/…, /shorts/…, /embed/… y /live/….
 */
export function videoIdDe(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  let id: string | null = null;
  if (url.hostname === 'youtu.be') {
    id = url.pathname.split('/')[1] ?? null;
  } else if (HOSTS_YOUTUBE.has(url.hostname)) {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else id = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1] ?? null;
  }
  return id && VIDEO_ID_RE.test(id) ? id : null;
}

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Valida el body de `POST /api/admin/tutoriales` ({ titulo, link }). Lanza TutorialInvalido. */
export function parseTutorial(body: unknown): TutorialInput {
  if (!esObjeto(body)) throw new TutorialInvalido('Faltan el título y el link.');
  const titulo = typeof body.titulo === 'string' ? body.titulo.trim() : '';
  if (!titulo) throw new TutorialInvalido('Poné un título.');
  if (titulo.length > TITULO_MAX) {
    throw new TutorialInvalido(`El título puede tener hasta ${TITULO_MAX} letras.`);
  }
  const video_id = typeof body.link === 'string' ? videoIdDe(body.link) : null;
  if (!video_id) throw new TutorialInvalido('El link tiene que ser de un video de YouTube.');
  return { titulo, video_id };
}
