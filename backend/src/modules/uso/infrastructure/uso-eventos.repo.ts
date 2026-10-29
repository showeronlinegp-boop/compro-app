import type { PrismaClient } from '@prisma/client';
import { DIAS_RETENCION, type Lote } from '../domain/evento.js';

type PrismaLike = Pick<PrismaClient, 'uso_eventos'>;

export interface UsoEventosRepo {
  registrar(lote: Lote): Promise<void>;
}

/** Escritura de eventos del usuario actual. */
export function makeUsoEventosRepo(
  prisma: PrismaLike,
  userIdOrGetter: number | (() => number),
): UsoEventosRepo {
  const uid = typeof userIdOrGetter === 'function' ? userIdOrGetter : () => userIdOrGetter;
  return {
    async registrar({ eventos, standalone, movil }) {
      await prisma.uso_eventos.createMany({
        data: eventos.map((e) => ({ ...e, user_id: uid(), standalone, movil })),
      });
    },
  };
}

/** Borra los eventos de más de DIAS_RETENCION días (de todos). Devuelve cuántos borró. */
export async function purgarEventosViejos(prisma: PrismaLike, ahora = new Date()): Promise<number> {
  const limite = new Date(ahora.getTime() - DIAS_RETENCION * 86_400_000);
  const { count } = await prisma.uso_eventos.deleteMany({ where: { created_at: { lt: limite } } });
  return count;
}
