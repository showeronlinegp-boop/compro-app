/**
 * Tipos de las notas de prueba. Espejo del DTO de `/api/test-notes`
 * (backend/src/modules/test-notes/domain/test-note.ts → `TestNoteDto`).
 */

export type Tipo = 'error' | 'mejora' | 'duda';
export type Estado =
  | 'abierta'
  | 'en_curso'
  | 'consulta'
  | 'para_revisar'
  | 'corregida'
  | 'descartada';
/** Qué se le pide a Claude antes de tocar código. Sin ninguno: la trabaja directo. */
export type Modo = 'debatir' | 'investigar' | 'consultas';

export interface CapturedError {
  at: string;
  tipo: string;
  mensaje: string;
  origen?: string;
}

export interface CapturedApi {
  at: string;
  metodo: string;
  url: string;
  status: number | 'sin respuesta';
  error: string;
}

export interface Contexto {
  viewport: string;
  userAgent: string;
  errores: CapturedError[];
  api: CapturedApi[];
}

/** Lo que guarda "Marcar en pantalla". */
export interface Mark {
  selector: string | null;
  elemento: string | null;
  /** Fracción del ancho de `<main>` (0–1). */
  pos_x: number;
  /** px desde el tope del contenido de `<main>`. */
  pos_y: number;
  /** Ancho de la ventana (dato informativo). */
  viewport_w: number;
}

export interface TestNote {
  id: number;
  user_id: number;
  /** Email del autor o `#<user_id>`. Las notas son compartidas entre cuentas. */
  autor: string;
  tipo: Tipo;
  estado: Estado;
  texto: string;
  ruta: string;
  pantalla: string | null;
  selector: string | null;
  elemento: string | null;
  pos_x: number | null;
  pos_y: number | null;
  viewport_w: number | null;
  contexto: Record<string, unknown> | null;
  modo: Modo[];
  respuesta: string | null;
  resuelta_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewTestNote extends Partial<Mark> {
  tipo: Tipo;
  texto: string;
  modo: Modo[];
  ruta: string;
  pantalla: string;
  contexto: Contexto;
}

export type NotePatch = Partial<Pick<TestNote, 'estado' | 'modo'>>;
