import { Prisma, type PrismaClient } from '@prisma/client';
import {
  type AjustesInput,
  type ClienteInput,
  FiadoError,
  type MovimientoInput,
  type MovimientoLedger,
  type OrdenClientes,
  PLANTILLAS_DEFAULT,
  type TipoMovimiento,
  coincideNombre,
  diasSinPagar,
  excedeLimite,
  fechaAR,
  montoConSigno,
  montoCorreccion,
  ordenarClientes,
  paraCobrarHoy,
  saldo,
  telefonoWhatsApp,
} from '../domain/fiado.js';

// ─── Vistas que devuelve la API ───────────────────────────────────────────────

export interface ClienteView {
  id: number;
  nombre: string;
  telefono: string | null;
  /** `549…` listo para `wa.me`, o null si el teléfono no se pudo interpretar. */
  whatsapp: string | null;
  etiqueta: string | null;
  limite: number | null;
  /** 'AAAA-MM-DD' o null. */
  proximo_cobro: string | null;
  saldo: number;
  dias_sin_pagar: number | null;
  excede_limite: boolean;
}

export interface MovimientoView {
  id: number;
  cliente_id: number;
  cliente_nombre: string;
  tipo: TipoMovimiento;
  monto: number;
  nota: string | null;
  created_at: string;
  /** En una corrección: el movimiento que deshace. */
  corrige_id: number | null;
  /** En un movimiento corregido: la corrección que lo deshizo. */
  corregido_por: number | null;
}

export interface CobroView extends ClienteView {
  recordado_hoy: boolean;
}

export interface ResumenView {
  total: number;
  clientes_con_deuda: number;
  para_cobrar: CobroView[];
  ultimos: MovimientoView[];
}

export interface FichaView {
  cliente: ClienteView;
  historial: MovimientoView[];
}

export interface MovimientoResult {
  movimiento: MovimientoView;
  cliente: ClienteView;
}

export interface AjustesView {
  comercio: string;
  alias: string | null;
  dias_deuda_vieja: number;
  plantilla_fiado: string;
  plantilla_pago: string;
  plantilla_recordatorio: string;
}

export interface FiadoRepo {
  resumen(): Promise<ResumenView>;
  listClientes(q: string, orden: OrdenClientes): Promise<ClienteView[]>;
  crearCliente(input: ClienteInput): Promise<ClienteView>;
  ficha(clienteId: number): Promise<FichaView>;
  actualizarCliente(clienteId: number, patch: Partial<ClienteInput>): Promise<ClienteView>;
  crearMovimiento(input: MovimientoInput): Promise<MovimientoResult>;
  corregirMovimiento(movimientoId: number): Promise<MovimientoResult>;
  registrarRecordatorio(clienteId: number): Promise<{ cliente_id: number; enviado_at: string }>;
  getAjustes(): Promise<AjustesView>;
  putAjustes(input: AjustesInput): Promise<AjustesView>;
}

type PrismaLike = Pick<
  PrismaClient,
  'fiado_clientes' | 'fiado_movimientos' | 'fiado_recordatorios' | 'fiado_ajustes'
>;

type ClienteRow = Prisma.fiado_clientesGetPayload<object>;
type MovRow = Prisma.fiado_movimientosGetPayload<object>;

const toLedger = (m: MovRow): MovimientoLedger => ({
  id: m.id,
  cliente_id: m.cliente_id,
  tipo: m.tipo as TipoMovimiento,
  monto: m.monto,
  corrige_id: m.corrige_id,
  created_at: m.created_at,
});

const ymd = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);
const toDate = (s: string | null): Date | null => (s ? new Date(`${s}T00:00:00Z`) : null);

function isUniqueViolation(err: unknown, field: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false;
  const target = JSON.stringify(err.meta ?? {});
  return target.includes(field);
}

/**
 * Repo del módulo Fiado, siempre acotado al usuario actual. Cada lectura y
 * escritura filtra por `user_id`; un id de otro usuario se comporta como
 * inexistente (404).
 */
export function makeFiadoRepo(prisma: PrismaLike, userId: number | (() => number)): FiadoRepo {
  const uid = () => (typeof userId === 'function' ? userId() : userId);
  const hoy = () => fechaAR(new Date());

  async function clienteOr404(clienteId: number): Promise<ClienteRow> {
    const c = await prisma.fiado_clientes.findFirst({ where: { id: clienteId, user_id: uid() } });
    if (!c) throw new FiadoError(404, 'Cliente no encontrado');
    return c;
  }

  async function movimientosDe(clienteId?: number): Promise<MovRow[]> {
    return prisma.fiado_movimientos.findMany({
      where: { user_id: uid(), ...(clienteId ? { cliente_id: clienteId } : {}) },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });
  }

  function clienteView(
    c: ClienteRow,
    movs: readonly MovimientoLedger[],
    fecha: string,
  ): ClienteView {
    const s = saldo(movs);
    return {
      id: c.id,
      nombre: c.nombre,
      telefono: c.telefono,
      whatsapp: telefonoWhatsApp(c.telefono),
      etiqueta: c.etiqueta,
      limite: c.limite,
      proximo_cobro: ymd(c.proximo_cobro),
      saldo: s,
      dias_sin_pagar: diasSinPagar(movs, fecha),
      excede_limite: excedeLimite(s, c.limite),
    };
  }

  function movimientoView(
    m: MovRow,
    nombre: string,
    correccionDe: Map<number, number>,
  ): MovimientoView {
    return {
      id: m.id,
      cliente_id: m.cliente_id,
      cliente_nombre: nombre,
      tipo: m.tipo as TipoMovimiento,
      monto: m.monto,
      nota: m.nota,
      created_at: m.created_at.toISOString(),
      corrige_id: m.corrige_id,
      corregido_por: correccionDe.get(m.id) ?? null,
    };
  }

  /** original.id → id de la corrección que lo deshizo. */
  function mapaCorrecciones(movs: readonly MovRow[]): Map<number, number> {
    const out = new Map<number, number>();
    for (const m of movs) if (m.corrige_id != null) out.set(m.corrige_id, m.id);
    return out;
  }

  /** Clientes del usuario con sus movimientos agrupados (todo en 2 queries). */
  async function cartera() {
    const [clientes, movs] = await Promise.all([
      prisma.fiado_clientes.findMany({ where: { user_id: uid() } }),
      movimientosDe(),
    ]);
    const porCliente = new Map<number, MovimientoLedger[]>();
    for (const m of movs) {
      const list = porCliente.get(m.cliente_id) ?? [];
      list.push(toLedger(m));
      porCliente.set(m.cliente_id, list);
    }
    return { clientes, movs, porCliente };
  }

  async function resultado(mov: MovRow, cliente: ClienteRow): Promise<MovimientoResult> {
    const movs = await movimientosDe(cliente.id);
    return {
      movimiento: movimientoView(mov, cliente.nombre, mapaCorrecciones(movs)),
      cliente: clienteView(cliente, movs.map(toLedger), hoy()),
    };
  }

  async function ajustesRow() {
    return prisma.fiado_ajustes.findUnique({ where: { user_id: uid() } });
  }

  function ajustesView(row: Awaited<ReturnType<typeof ajustesRow>>): AjustesView {
    return {
      comercio: row?.comercio ?? '',
      alias: row?.alias ?? null,
      dias_deuda_vieja: row?.dias_deuda_vieja ?? 30,
      plantilla_fiado: row?.plantilla_fiado ?? PLANTILLAS_DEFAULT.fiado,
      plantilla_pago: row?.plantilla_pago ?? PLANTILLAS_DEFAULT.pago,
      plantilla_recordatorio: row?.plantilla_recordatorio ?? PLANTILLAS_DEFAULT.recordatorio,
    };
  }

  return {
    async resumen() {
      const fecha = hoy();
      const [{ clientes, movs, porCliente }, ajustes, recordados] = await Promise.all([
        cartera(),
        ajustesRow(),
        prisma.fiado_recordatorios.findMany({
          where: { user_id: uid(), enviado_at: { gte: new Date(Date.now() - 36 * 3_600_000) } },
        }),
      ]);
      const umbral = ajustes?.dias_deuda_vieja ?? 30;
      const recordadoHoy = new Set(
        recordados.filter((r) => fechaAR(r.enviado_at) === fecha).map((r) => r.cliente_id),
      );
      const views = clientes.map((c) => clienteView(c, porCliente.get(c.id) ?? [], fecha));
      const conDeuda = views.filter((v) => v.saldo > 0);
      const para_cobrar = ordenarClientes(
        views.filter((v) =>
          paraCobrarHoy({
            saldo: v.saldo,
            diasSinPagar: v.dias_sin_pagar,
            proximoCobro: v.proximo_cobro,
            umbralDias: umbral,
            hoy: fecha,
          }),
        ),
        'dias',
      ).map((v) => ({ ...v, recordado_hoy: recordadoHoy.has(v.id) }));

      const nombres = new Map(clientes.map((c) => [c.id, c.nombre]));
      const correcciones = mapaCorrecciones(movs);
      const ultimos = [...movs]
        .reverse()
        .slice(0, 4)
        .map((m) => movimientoView(m, nombres.get(m.cliente_id) ?? '', correcciones));

      return {
        total: conDeuda.reduce((acc, v) => acc + v.saldo, 0),
        clientes_con_deuda: conDeuda.length,
        para_cobrar,
        ultimos,
      };
    },

    async listClientes(q, orden) {
      const fecha = hoy();
      const { clientes, porCliente } = await cartera();
      const views = clientes
        .filter((c) => !q || coincideNombre(c.nombre, q))
        .map((c) => clienteView(c, porCliente.get(c.id) ?? [], fecha));
      return ordenarClientes(views, orden);
    },

    async crearCliente(input) {
      const c = await prisma.fiado_clientes.create({
        data: {
          user_id: uid(),
          nombre: input.nombre,
          telefono: input.telefono,
          etiqueta: input.etiqueta,
          limite: input.limite,
          proximo_cobro: toDate(input.proximo_cobro),
        },
      });
      return clienteView(c, [], hoy());
    },

    async ficha(clienteId) {
      const cliente = await clienteOr404(clienteId);
      const movs = await movimientosDe(clienteId);
      const correcciones = mapaCorrecciones(movs);
      return {
        cliente: clienteView(cliente, movs.map(toLedger), hoy()),
        historial: [...movs].reverse().map((m) => movimientoView(m, cliente.nombre, correcciones)),
      };
    },

    async actualizarCliente(clienteId, patch) {
      await clienteOr404(clienteId);
      const data: Prisma.fiado_clientesUpdateInput = {};
      if (patch.nombre !== undefined) data.nombre = patch.nombre;
      if (patch.telefono !== undefined) data.telefono = patch.telefono;
      if (patch.etiqueta !== undefined) data.etiqueta = patch.etiqueta;
      if (patch.limite !== undefined) data.limite = patch.limite;
      if (patch.proximo_cobro !== undefined) data.proximo_cobro = toDate(patch.proximo_cobro);
      const c = await prisma.fiado_clientes.update({ where: { id: clienteId }, data });
      const movs = await movimientosDe(clienteId);
      return clienteView(c, movs.map(toLedger), hoy());
    },

    async crearMovimiento(input) {
      const cliente = await clienteOr404(input.cliente_id);
      if (input.idempotency_key) {
        const previo = await prisma.fiado_movimientos.findFirst({
          where: { user_id: uid(), idempotency_key: input.idempotency_key },
        });
        if (previo) return resultado(previo, cliente);
      }
      try {
        const mov = await prisma.fiado_movimientos.create({
          data: {
            user_id: uid(),
            cliente_id: cliente.id,
            tipo: input.tipo,
            monto: montoConSigno(input.tipo, input.monto),
            nota: input.nota,
            idempotency_key: input.idempotency_key,
          },
        });
        return resultado(mov, cliente);
      } catch (err) {
        // Dos envíos simultáneos con la misma clave: devolver el que ganó.
        if (input.idempotency_key && isUniqueViolation(err, 'idempotency_key')) {
          const previo = await prisma.fiado_movimientos.findFirst({
            where: { user_id: uid(), idempotency_key: input.idempotency_key },
          });
          if (previo) return resultado(previo, cliente);
        }
        throw err;
      }
    },

    async corregirMovimiento(movimientoId) {
      const original = await prisma.fiado_movimientos.findFirst({
        where: { id: movimientoId, user_id: uid() },
        include: { corregido: { select: { id: true } } },
      });
      if (!original) throw new FiadoError(404, 'Movimiento no encontrado');
      const monto = montoCorreccion(toLedger(original), original.corregido != null);
      const cliente = await clienteOr404(original.cliente_id);
      try {
        const mov = await prisma.fiado_movimientos.create({
          data: {
            user_id: uid(),
            cliente_id: original.cliente_id,
            tipo: 'correccion',
            monto,
            corrige_id: original.id,
          },
        });
        return resultado(mov, cliente);
      } catch (err) {
        if (isUniqueViolation(err, 'corrige_id')) {
          throw new FiadoError(409, 'Ese movimiento ya fue corregido');
        }
        throw err;
      }
    },

    async registrarRecordatorio(clienteId) {
      await clienteOr404(clienteId);
      const r = await prisma.fiado_recordatorios.create({
        data: { user_id: uid(), cliente_id: clienteId },
      });
      return { cliente_id: r.cliente_id, enviado_at: r.enviado_at.toISOString() };
    },

    async getAjustes() {
      return ajustesView(await ajustesRow());
    },

    async putAjustes(input) {
      const row = await prisma.fiado_ajustes.upsert({
        where: { user_id: uid() },
        create: { user_id: uid(), ...input, comercio: input.comercio ?? '' },
        update: input,
      });
      return ajustesView(row);
    },
  };
}
