import { req, reqOptional } from './http';

/**
 * Tutoriales en video (YouTube): los carga el admin desde el panel y los ve
 * cada comercio en Ajustes. El backend guarda sólo el id del video; el link se
 * arma acá, así que siempre apunta a youtube.com.
 */
export interface Tutorial {
  id: number;
  titulo: string;
  video_id: string;
}

export const linkDeVideo = (videoId: string) =>
  `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;

export const tutorialesApi = {
  listar: () => req<Tutorial[]>('/tutoriales'),
  crear: (titulo: string, link: string) =>
    req<Tutorial>('/admin/tutoriales', { method: 'POST', body: JSON.stringify({ titulo, link }) }),
  /** 204 al borrar; 404 si ya no estaba (para el panel, da lo mismo). */
  borrar: (id: number) => reqOptional<null>(`/admin/tutoriales/${id}`, { method: 'DELETE' }),
};
