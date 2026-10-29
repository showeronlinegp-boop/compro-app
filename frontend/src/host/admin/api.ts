import { req } from '../http';

// Espejo de UsoReporte (backend/src/modules/admin/domain/uso.ts).

export type Accion = 'cliente' | 'fiado' | 'pago' | 'correccion' | 'recordatorio';

export interface Semana {
  /** Lunes 'AAAA-MM-DD'. */
  semana: string;
  altas: number;
  /** Anotaron algo esa semana. */
  activos: number;
  /** Abrieron alguna pantalla esa semana. */
  abrieron: number;
  por_accion: Record<Accion, number>;
}

export interface Cohorte {
  semana: string;
  comercios: number;
  retencion: number[];
}

export interface VistasPantalla {
  modulo: string;
  ruta_id: string;
  vistas: number;
  comercios: number;
}

export interface ComercioUso {
  user_id: number;
  email: string | null;
  comercio: string | null;
  alta: string;
  clientes: number;
  fiados: number;
  pagos: number;
  recordatorios: number;
  comprobantes: number;
  instalada: boolean;
  ultima_actividad: string | null;
  ultima_vista: string | null;
  ultimo_ingreso: string | null;
  ultimo_login: string | null;
}

export interface UsoReporte {
  generado_at: string;
  ingresos: 'clerk' | 'no_disponible';
  eventos_desde: string | null;
  totales: {
    comercios: number;
    activos_7d: number;
    activos_30d: number;
    ingresaron_7d: number | null;
    abrieron_7d: number;
    usan_instalada: number;
    usan_celular: number;
  };
  embudo: { paso: string; comercios: number }[];
  adopcion: { funcion: string; comercios: number; de: number }[];
  semanal: Semana[];
  cohortes: Cohorte[];
  pantallas: VistasPantalla[];
  comercios: ComercioUso[];
}

export const adminApi = {
  uso: (semanas: number) => req<UsoReporte>(`/admin/uso?semanas=${semanas}`),
  /** true si la cuenta es admin; cualquier error (401, 403, red) = no. */
  acceso: async (): Promise<boolean> => {
    try {
      return (await req<{ admin: boolean }>('/admin/acceso')).admin === true;
    } catch {
      return false;
    }
  },
};
