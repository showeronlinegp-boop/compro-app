import { Prisma, type PrismaClient } from '@prisma/client';
import { TZ } from '../../fiado/domain/fiado.js';
import type { Accion, ActividadSemanal, ComercioHechos } from '../domain/uso.js';

type PrismaLike = Pick<PrismaClient, '$queryRaw'>;

export interface UsoRepo {
  /** Una fila por comercio, sin las cuentas excluidas. */
  comercios(): Promise<ComercioHechos[]>;
  /** (comercio, semana, acción) distintos desde el lunes `desde` ('AAAA-MM-DD'). */
  actividad(desde: string): Promise<ActividadSemanal[]>;
}

/**
 * Lecturas agregadas de TODOS los comercios (no tiene dueño: sólo lo usa el
 * panel de admin). `excluir` = Clerk user IDs que no cuentan en las métricas.
 */
export function makeUsoRepo(prisma: PrismaLike, excluir: readonly string[]): UsoRepo {
  const incluidos = Prisma.sql`
    SELECT id FROM users WHERE NOT (clerk_user_id = ANY(${[...excluir]}::text[]))`;
  const semana = (col: Prisma.Sql) =>
    Prisma.sql`date_trunc('week', ${col} AT TIME ZONE ${TZ})::date::text`;

  return {
    async comercios() {
      return prisma.$queryRaw<ComercioHechos[]>(Prisma.sql`
        SELECT u.id AS user_id, u.clerk_user_id, u.email, u.created_at AS alta,
          a.comercio,
          COALESCE(a.alias <> '', false) AS alias,
          (CASE WHEN a.plantilla_fiado IS NULL THEN 0 ELSE 1 END
            + CASE WHEN a.plantilla_pago IS NULL THEN 0 ELSE 1 END
            + CASE WHEN a.plantilla_recordatorio IS NULL THEN 0 ELSE 1 END) AS plantillas_propias,
          c.clientes, c.clientes_con_telefono, c.clientes_con_limite,
          c.clientes_con_etiqueta, c.clientes_con_proximo_cobro, c.primer_cliente,
          m.fiados, m.fiados_con_vence, m.pagos, m.correcciones, m.primer_fiado, m.primer_pago,
          r.recordatorios, r.primer_recordatorio,
          GREATEST(c.ultimo_cliente, m.ultimo_movimiento, r.ultimo_recordatorio, a.updated_at)
            AS ultima_actividad
        FROM users u
        LEFT JOIN fiado_ajustes a ON a.user_id = u.id
        CROSS JOIN LATERAL (
          SELECT count(*)::int AS clientes,
            count(*) FILTER (WHERE telefono <> '')::int AS clientes_con_telefono,
            count(*) FILTER (WHERE limite IS NOT NULL)::int AS clientes_con_limite,
            count(*) FILTER (WHERE etiqueta <> '')::int AS clientes_con_etiqueta,
            count(*) FILTER (WHERE proximo_cobro IS NOT NULL)::int AS clientes_con_proximo_cobro,
            min(created_at) AS primer_cliente,
            max(updated_at) AS ultimo_cliente
          FROM fiado_clientes WHERE user_id = u.id
        ) c
        CROSS JOIN LATERAL (
          SELECT count(*) FILTER (WHERE tipo = 'fiado')::int AS fiados,
            count(*) FILTER (WHERE tipo = 'fiado' AND vence IS NOT NULL)::int AS fiados_con_vence,
            count(*) FILTER (WHERE tipo = 'pago')::int AS pagos,
            count(*) FILTER (WHERE tipo = 'correccion')::int AS correcciones,
            min(created_at) FILTER (WHERE tipo = 'fiado') AS primer_fiado,
            min(created_at) FILTER (WHERE tipo = 'pago') AS primer_pago,
            max(created_at) AS ultimo_movimiento
          FROM fiado_movimientos WHERE user_id = u.id
        ) m
        CROSS JOIN LATERAL (
          SELECT count(*)::int AS recordatorios,
            min(enviado_at) AS primer_recordatorio,
            max(enviado_at) AS ultimo_recordatorio
          FROM fiado_recordatorios WHERE user_id = u.id
        ) r
        WHERE u.id IN (${incluidos})
        ORDER BY u.id`);
    },

    async actividad(desde) {
      const rows = await prisma.$queryRaw<
        Array<{ user_id: number; semana: string; accion: Accion }>
      >(
        Prisma.sql`
          SELECT DISTINCT user_id, semana, accion FROM (
            SELECT user_id, ${semana(Prisma.sql`created_at`)} AS semana, tipo AS accion
              FROM fiado_movimientos
            UNION ALL
            SELECT user_id, ${semana(Prisma.sql`enviado_at`)}, 'recordatorio' FROM fiado_recordatorios
            UNION ALL
            SELECT user_id, ${semana(Prisma.sql`created_at`)}, 'cliente' FROM fiado_clientes
          ) x
          WHERE semana >= ${desde} AND user_id IN (${incluidos})`,
      );
      return rows;
    },
  };
}
