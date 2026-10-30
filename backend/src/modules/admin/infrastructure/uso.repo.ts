import { Prisma, type PrismaClient } from '@prisma/client';
import { TZ } from '../../fiado/domain/fiado.js';
import type {
  Accion,
  ActividadSemanal,
  Apertura,
  ComercioHechos,
  VistasPantalla,
} from '../domain/uso.js';

type PrismaLike = Pick<PrismaClient, '$queryRaw'>;

export interface UsoRepo {
  /** Una fila por comercio, sin las cuentas excluidas. */
  comercios(): Promise<ComercioHechos[]>;
  /** (comercio, semana, acción) distintos desde el lunes `desde` ('AAAA-MM-DD'). */
  actividad(desde: string): Promise<ActividadSemanal[]>;
  /** (comercio, semana) en que abrió alguna pantalla, desde el lunes `desde`. */
  aperturas(desde: string): Promise<Apertura[]>;
  /** Vistas y comercios distintos por pantalla desde el lunes `desde`. */
  pantallas(desde: string): Promise<VistasPantalla[]>;
  /** Primer evento de uso registrado (antes no se medían pantallas), o null. */
  eventosDesde(): Promise<Date | null>;
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
          e.comprobantes, e.ultima_vista, e.uso_instalada, e.uso_movil,
          (a.recargo IS NOT NULL) AS recargos_activos,
          m.recargos_sumados, o.recargos_no_cobrados,
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
            max(created_at) AS ultimo_movimiento,
            count(*) FILTER (WHERE tipo = 'recargo')::int AS recargos_sumados
          FROM fiado_movimientos WHERE user_id = u.id
        ) m
        CROSS JOIN LATERAL (
          SELECT count(*)::int AS recargos_no_cobrados
          FROM fiado_recargo_omisiones WHERE user_id = u.id
        ) o
        CROSS JOIN LATERAL (
          SELECT count(*)::int AS recordatorios,
            min(enviado_at) AS primer_recordatorio,
            max(enviado_at) AS ultimo_recordatorio
          FROM fiado_recordatorios WHERE user_id = u.id
        ) r
        CROSS JOIN LATERAL (
          SELECT count(*) FILTER (WHERE evento = 'comprobante')::int AS comprobantes,
            max(created_at) FILTER (WHERE evento = 'pantalla') AS ultima_vista,
            COALESCE(bool_or(standalone), false) AS uso_instalada,
            COALESCE(bool_or(movil), false) AS uso_movil
          FROM uso_eventos WHERE user_id = u.id
        ) e
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

    async aperturas(desde) {
      return prisma.$queryRaw<Apertura[]>(Prisma.sql`
        SELECT DISTINCT user_id, ${semana(Prisma.sql`created_at`)} AS semana
        FROM uso_eventos
        WHERE evento = 'pantalla' AND ${semana(Prisma.sql`created_at`)} >= ${desde}
          AND user_id IN (${incluidos})`);
    },

    async pantallas(desde) {
      return prisma.$queryRaw<VistasPantalla[]>(Prisma.sql`
        SELECT modulo, ruta_id, count(*)::int AS vistas, count(DISTINCT user_id)::int AS comercios
        FROM uso_eventos
        WHERE evento = 'pantalla' AND ${semana(Prisma.sql`created_at`)} >= ${desde}
          AND user_id IN (${incluidos})
        GROUP BY modulo, ruta_id
        ORDER BY comercios DESC, vistas DESC, modulo, ruta_id`);
    },

    async eventosDesde() {
      const [row] = await prisma.$queryRaw<Array<{ desde: Date | null }>>(Prisma.sql`
        SELECT min(created_at) AS desde FROM uso_eventos WHERE user_id IN (${incluidos})`);
      return row?.desde ?? null;
    },
  };
}
