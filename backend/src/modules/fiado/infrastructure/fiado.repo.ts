import { Prisma, type PrismaClient } from '@prisma/client';
import {
  type AjustesInput,
  type ClienteInput,
  DIAS_PROXIMOS,
  FiadoError,
  type FiadoPendiente,
  type MovimientoInput,
  type MovimientoLedger,
  type OrdenClientes,
  PLANTILLAS_DEFAULT,
  type TipoMovimiento,
  coincideNombre,
  diasSinPagar,
  excedeLimite,
  fechaAR,
  idsCorregidos,
  imputarFiados,
  montoConSigno,
  montoCorreccion,
  ordenarClientes,
  paraCobrarHoy,
  recargosPendientes,
  saldo,
  sumarDias,
  telefonoWhatsApp,
  vencimientos,
} from '../domain/fiado.js';
import {
  type ConfigRecargo,
  type RecargoSugerido,
  condicionesTexto,
  parseConfigRecargo,
  recargosSugeridos,
  requiereAviso,
  TERMINOS_RECARGO_VERSION,
  textoAvisoRecargo,
} from '../domain/recargo.js';

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
  /** Lo que ya tendría que haber pagado (vence hoy o antes). */
  vencido: number;
  /** 'AAAA-MM-DD' del vencimiento vencido más viejo, o null. */
  vencido_desde: string | null;
  /** El próximo vencimiento que todavía no llegó. */
  proximo_vencimiento: { fecha: string; monto: number } | null;
  /** No sugerirle recargos a este cliente. */
  sin_recargo: boolean;
  /** Parte del saldo que son recargos sin pagar. */
  recargos_pendientes: number;
  /** Total de recargos sugeridos para sumar hoy (0 = nada que decidir). */
  recargo_para_sumar: number;
  /** Hay que avisarle las condiciones antes de anotarle fiados o recargos. */
  aviso_recargo_pendiente: boolean;
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
  /** En un fiado vigente: cuándo vence (la elegida o la de deuda vieja). */
  vence: string | null;
  /** En un fiado o recargo vigente: lo que falta pagar. */
  pendiente: number | null;
  /** En un recargo: el fiado al que pertenece. */
  recargo_de: number | null;
  /** En un recargo: días de atraso que cubre. */
  recargo_dias: number | null;
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

/** Un cliente dentro de un grupo de avisos: cuánto y desde/para cuándo. */
export interface AvisoView {
  cliente_id: number;
  cliente_nombre: string;
  monto: number;
  /** Vencidos: el más viejo. Hoy y próximos: el más cercano. */
  fecha: string;
  recordado_hoy: boolean;
}

export interface AvisosView {
  vencidos: AvisoView[];
  hoy: AvisoView[];
  proximos: AvisoView[];
  /** Para la campanita: clientes vencidos u hoy a los que todavía no les recordaste hoy. */
  sin_recordar: number;
}

/** Estado del recargo en la ficha de un cliente. */
export interface RecargoFichaView {
  /** Aviso de condiciones pendiente: el texto fijo para mandarle. */
  aviso: { texto: string } | null;
  /** Recargos sugeridos hoy, uno por fiado (vacío si falta el aviso). */
  sugeridos: RecargoSugerido[];
  total: number;
}

export interface FichaView {
  cliente: ClienteView;
  historial: MovimientoView[];
  /** null = recargos apagados o cliente "sin recargo". */
  recargo: RecargoFichaView | null;
}

export interface MovimientoResult {
  movimiento: MovimientoView;
  cliente: ClienteView;
}

export interface RecargosResult {
  movimientos: MovimientoView[];
  cliente: ClienteView;
}

export interface AvisoRecargoView {
  cliente_id: number;
  version: number;
  condiciones: string;
  via: 'whatsapp' | 'informado';
  created_at: string;
}

export interface AjustesView {
  comercio: string;
  alias: string | null;
  dias_deuda_vieja: number;
  plantilla_fiado: string;
  plantilla_pago: string;
  plantilla_recordatorio: string;
  /** null = recargos apagados. */
  recargo: ConfigRecargo | null;
  /** Las condiciones en una frase, para mensajes y Ajustes; null si está apagado. */
  recargo_condiciones: string | null;
  recargo_version: number;
  /** Versión vigente de los términos del recargo y si el comercio ya la aceptó. */
  recargo_terminos_version: string;
  recargo_terminos_aceptados: boolean;
}

export interface FiadoRepo {
  resumen(): Promise<ResumenView>;
  avisos(): Promise<AvisosView>;
  listClientes(q: string, orden: OrdenClientes): Promise<ClienteView[]>;
  crearCliente(input: ClienteInput): Promise<ClienteView>;
  ficha(clienteId: number): Promise<FichaView>;
  actualizarCliente(clienteId: number, patch: Partial<ClienteInput>): Promise<ClienteView>;
  crearMovimiento(input: MovimientoInput): Promise<MovimientoResult>;
  corregirMovimiento(movimientoId: number): Promise<MovimientoResult>;
  /** "Perdonar" un recargo: lo deshace y marca su período "No cobrar". */
  perdonarRecargo(movimientoId: number): Promise<MovimientoResult>;
  registrarRecordatorio(clienteId: number): Promise<{ cliente_id: number; enviado_at: string }>;
  getAjustes(): Promise<AjustesView>;
  putAjustes(input: AjustesInput): Promise<AjustesView>;
  /** Suma los recargos sugeridos (todos o los de `fiadoIds`), uno por fiado. */
  sumarRecargos(
    clienteId: number,
    fiadoIds: number[] | null,
    idempotencyKey: string | null,
  ): Promise<RecargosResult>;
  /** "No cobrar": saltea el período sugerido de ese fiado. */
  omitirRecargo(clienteId: number, fiadoId: number): Promise<FichaView>;
  /** Registra que se le avisaron las condiciones vigentes al cliente. */
  registrarAvisoRecargo(
    clienteId: number,
    via: 'whatsapp' | 'informado',
  ): Promise<AvisoRecargoView>;
}

type PrismaLike = Pick<
  PrismaClient,
  | 'fiado_clientes'
  | 'fiado_movimientos'
  | 'fiado_recordatorios'
  | 'fiado_ajustes'
  | 'fiado_avisos_recargo'
  | 'fiado_recargo_omisiones'
  | 'fiado_terminos_aceptados'
>;

/** Lo que hace falta para calcular recargos de cualquier cliente del usuario. */
interface RecargoCtx {
  config: ConfigRecargo | null;
  version: number;
  comercio: string;
  /** fiado_id → días de atraso hasta los que se omitió ("No cobrar"). */
  omitidos: ReadonlyMap<number, number>;
}

type ClienteRow = Prisma.fiado_clientesGetPayload<object>;
type MovRow = Prisma.fiado_movimientosGetPayload<object>;

const toLedger = (m: MovRow): MovimientoLedger => ({
  id: m.id,
  cliente_id: m.cliente_id,
  tipo: m.tipo as TipoMovimiento,
  monto: m.monto,
  corrige_id: m.corrige_id,
  vence: m.vence ? m.vence.toISOString().slice(0, 10) : null,
  created_at: m.created_at,
  recargo_de: m.recargo_de,
  recargo_dias: m.recargo_dias,
});

/** La configuración guardada en `fiado_ajustes.recargo` (la valida parseConfigRecargo al guardar). */
const configDe = (v: Prisma.JsonValue | null | undefined): ConfigRecargo | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as unknown as ConfigRecargo) : null;

/**
 * Último período ya tratado de cada fiado: con un recargo vigente o marcado
 * "No cobrar". Un recargo deshecho NO cuenta ("me equivoqué": la sugerencia
 * vuelve); perdonar un recargo además lo marca "No cobrar", así no reaparece.
 */
function tratadosDe(
  movs: readonly MovimientoLedger[],
  omitidos: ReadonlyMap<number, number>,
): Map<number, number> {
  const out = new Map(omitidos);
  const deshechos = idsCorregidos(movs);
  for (const m of movs) {
    if (m.tipo !== 'recargo' || m.recargo_de == null || m.recargo_dias == null) continue;
    if (deshechos.has(m.id)) continue;
    out.set(m.recargo_de, Math.max(out.get(m.recargo_de) ?? 0, m.recargo_dias));
  }
  return out;
}

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
    umbral: number,
    ctx: RecargoCtx,
  ): ClienteView {
    const s = saldo(movs);
    const pendientes = imputarFiados(movs, umbral);
    const rec = estadoRecargo(c, movs, pendientes, ctx, fecha);
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
      ...vencimientosView(pendientes, fecha),
      sin_recargo: c.sin_recargo,
      recargos_pendientes: recargosPendientes(pendientes),
      recargo_para_sumar: rec?.total ?? 0,
      aviso_recargo_pendiente: rec?.aviso != null,
    };
  }

  /**
   * Recargo de un cliente hoy: null si están apagados o el cliente es "sin
   * recargo"; con aviso pendiente no se sugiere nada hasta avisarle.
   */
  function estadoRecargo(
    c: ClienteRow,
    movs: readonly MovimientoLedger[],
    pendientes: readonly FiadoPendiente[],
    ctx: RecargoCtx,
    fecha: string,
  ): RecargoFichaView | null {
    if (!ctx.config || c.sin_recargo) return null;
    if (c.recargo_aviso_version < ctx.version) {
      return {
        aviso: { texto: textoAvisoRecargo(ctx.config, ctx.comercio, c.nombre) },
        sugeridos: [],
        total: 0,
      };
    }
    const anotado = new Map(movs.map((m) => [m.id, fechaAR(m.created_at)]));
    const fiados = pendientes
      .filter((p) => p.recargo_de === null)
      .map((p) => ({
        id: p.id,
        fecha: anotado.get(p.id) ?? p.vence,
        vence: p.vence,
        pendiente: p.pendiente,
      }));
    const sugeridos = recargosSugeridos(fiados, tratadosDe(movs, ctx.omitidos), ctx.config, fecha);
    return { aviso: null, sugeridos, total: sugeridos.reduce((acc, r) => acc + r.monto, 0) };
  }

  /** Configuración, versión y "No cobrar" del usuario (de un cliente, si se pasa). */
  async function recargoCtx(clienteId?: number): Promise<RecargoCtx> {
    const [row, omisiones] = await Promise.all([
      ajustesRow(),
      prisma.fiado_recargo_omisiones.findMany({
        where: { user_id: uid(), ...(clienteId ? { cliente_id: clienteId } : {}) },
        select: { fiado_id: true, dias: true },
      }),
    ]);
    const omitidos = new Map<number, number>();
    for (const o of omisiones) {
      omitidos.set(o.fiado_id, Math.max(omitidos.get(o.fiado_id) ?? 0, o.dias));
    }
    return {
      config: configDe(row?.recargo),
      version: row?.recargo_version ?? 0,
      comercio: row?.comercio ?? '',
      omitidos,
    };
  }

  /** ¿Hay que avisarle las condiciones antes de anotarle fiados o recargos? */
  function avisoPendiente(c: ClienteRow, ctx: RecargoCtx): boolean {
    return ctx.config !== null && !c.sin_recargo && c.recargo_aviso_version < ctx.version;
  }

  function vencimientosView(pendientes: readonly FiadoPendiente[], fecha: string) {
    const v = vencimientos(pendientes, fecha);
    return {
      vencido: v.vencido,
      vencido_desde: v.vencido_desde,
      proximo_vencimiento: v.proximo,
    };
  }

  function movimientoView(
    m: MovRow,
    nombre: string,
    correccionDe: Map<number, number>,
    pendientes: ReadonlyMap<number, FiadoPendiente> = new Map(),
  ): MovimientoView {
    const p = pendientes.get(m.id);
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
      vence: m.tipo === 'fiado' ? (p?.vence ?? null) : null,
      pendiente: p?.pendiente ?? null,
      recargo_de: m.recargo_de,
      recargo_dias: m.recargo_dias,
    };
  }

  const porId = (ps: readonly FiadoPendiente[]) => new Map(ps.map((p) => [p.id, p]));

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
    const { movimientos, cliente: view } = await resultadoVarios([mov], cliente);
    return { movimiento: movimientos[0] as MovimientoView, cliente: view };
  }

  async function resultadoVarios(
    movsNuevos: readonly MovRow[],
    cliente: ClienteRow,
  ): Promise<RecargosResult> {
    const [movs, u, ctx] = await Promise.all([
      movimientosDe(cliente.id),
      umbral(),
      recargoCtx(cliente.id),
    ]);
    const ledger = movs.map(toLedger);
    const correcciones = mapaCorrecciones(movs);
    const pendientes = porId(imputarFiados(ledger, u));
    return {
      movimientos: movsNuevos.map((m) =>
        movimientoView(m, cliente.nombre, correcciones, pendientes),
      ),
      cliente: clienteView(cliente, ledger, hoy(), u, ctx),
    };
  }

  async function fichaDe(clienteId: number): Promise<FichaView> {
    const cliente = await clienteOr404(clienteId);
    const [movs, u, ctx] = await Promise.all([
      movimientosDe(clienteId),
      umbral(),
      recargoCtx(clienteId),
    ]);
    const ledger = movs.map(toLedger);
    const correcciones = mapaCorrecciones(movs);
    const imputados = imputarFiados(ledger, u);
    const pendientes = porId(imputados);
    const fecha = hoy();
    return {
      cliente: clienteView(cliente, ledger, fecha, u, ctx),
      historial: [...movs]
        .reverse()
        .map((m) => movimientoView(m, cliente.nombre, correcciones, pendientes)),
      recargo: estadoRecargo(cliente, ledger, imputados, ctx, fecha),
    };
  }

  /** Recargo vigente de un cliente, recalculado en el momento (para sumar u omitir). */
  async function recargoActual(cliente: ClienteRow): Promise<RecargoFichaView | null> {
    const [movs, u, ctx] = await Promise.all([
      movimientosDe(cliente.id),
      umbral(),
      recargoCtx(cliente.id),
    ]);
    const ledger = movs.map(toLedger);
    return estadoRecargo(cliente, ledger, imputarFiados(ledger, u), ctx, hoy());
  }

  async function ajustesRow() {
    return prisma.fiado_ajustes.findUnique({ where: { user_id: uid() } });
  }

  /** Días de "deuda vieja": a cuántos días vence un fiado sin fecha. */
  async function umbral(): Promise<number> {
    return (await ajustesRow())?.dias_deuda_vieja ?? 30;
  }

  async function recordadosHoy(fecha: string): Promise<Set<number>> {
    const recordados = await prisma.fiado_recordatorios.findMany({
      where: { user_id: uid(), enviado_at: { gte: new Date(Date.now() - 36 * 3_600_000) } },
    });
    return new Set(
      recordados.filter((r) => fechaAR(r.enviado_at) === fecha).map((r) => r.cliente_id),
    );
  }

  /** ¿El comercio aceptó la versión vigente de los términos del recargo? */
  async function aceptoTerminos(): Promise<boolean> {
    const n = await prisma.fiado_terminos_aceptados.count({
      where: { user_id: uid(), documento: 'recargo', version: TERMINOS_RECARGO_VERSION },
    });
    return n > 0;
  }

  function ajustesView(
    row: Awaited<ReturnType<typeof ajustesRow>>,
    terminosAceptados: boolean,
  ): AjustesView {
    return {
      comercio: row?.comercio ?? '',
      alias: row?.alias ?? null,
      dias_deuda_vieja: row?.dias_deuda_vieja ?? 30,
      plantilla_fiado: row?.plantilla_fiado ?? PLANTILLAS_DEFAULT.fiado,
      plantilla_pago: row?.plantilla_pago ?? PLANTILLAS_DEFAULT.pago,
      plantilla_recordatorio: row?.plantilla_recordatorio ?? PLANTILLAS_DEFAULT.recordatorio,
      recargo: configDe(row?.recargo),
      recargo_condiciones: row?.recargo
        ? condicionesTexto(configDe(row.recargo) as ConfigRecargo)
        : null,
      recargo_version: row?.recargo_version ?? 0,
      recargo_terminos_version: TERMINOS_RECARGO_VERSION,
      recargo_terminos_aceptados: terminosAceptados,
    };
  }

  return {
    async resumen() {
      const fecha = hoy();
      const [{ clientes, movs, porCliente }, u, recordadoHoy, ctx] = await Promise.all([
        cartera(),
        umbral(),
        recordadosHoy(fecha),
        recargoCtx(),
      ]);
      const views = clientes.map((c) => clienteView(c, porCliente.get(c.id) ?? [], fecha, u, ctx));
      const conDeuda = views.filter((v) => v.saldo > 0);
      // Primero los que tienen un recargo para decidir (vuelven a su lugar al
      // sumarlo o no cobrarlo); después, lo que venció hace más tiempo.
      const para_cobrar = views
        .filter((v) => paraCobrarHoy(v))
        .sort(
          (a, b) =>
            Number(b.recargo_para_sumar > 0) - Number(a.recargo_para_sumar > 0) ||
            (a.vencido_desde ?? '').localeCompare(b.vencido_desde ?? '') ||
            a.nombre.localeCompare(b.nombre, 'es'),
        )
        .map((v) => ({ ...v, recordado_hoy: recordadoHoy.has(v.id) }));

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

    async avisos() {
      const fecha = hoy();
      const hasta = sumarDias(fecha, DIAS_PROXIMOS);
      const [{ clientes, porCliente }, u, recordadoHoy] = await Promise.all([
        cartera(),
        umbral(),
        recordadosHoy(fecha),
      ]);
      const out: AvisosView = { vencidos: [], hoy: [], proximos: [], sin_recordar: 0 };
      for (const c of clientes) {
        const deben = imputarFiados(porCliente.get(c.id) ?? [], u).filter((p) => p.pendiente > 0);
        const aviso = (grupo: FiadoPendiente[]): AvisoView | null =>
          grupo[0]
            ? {
                cliente_id: c.id,
                cliente_nombre: c.nombre,
                monto: grupo.reduce((acc, p) => acc + p.pendiente, 0),
                fecha: grupo[0].vence,
                recordado_hoy: recordadoHoy.has(c.id),
              }
            : null;
        const vencido = aviso(deben.filter((p) => p.vence < fecha));
        const deHoy = aviso(deben.filter((p) => p.vence === fecha));
        const proximo = aviso(deben.filter((p) => p.vence > fecha && p.vence <= hasta));
        if (vencido) out.vencidos.push(vencido);
        if (deHoy) out.hoy.push(deHoy);
        if (proximo) out.proximos.push(proximo);
        if ((vencido || deHoy) && !recordadoHoy.has(c.id)) out.sin_recordar += 1;
      }
      const porFecha = (a: AvisoView, b: AvisoView) =>
        a.fecha.localeCompare(b.fecha) || a.cliente_nombre.localeCompare(b.cliente_nombre, 'es');
      out.vencidos.sort(porFecha);
      out.hoy.sort(porFecha);
      out.proximos.sort(porFecha);
      return out;
    },

    async listClientes(q, orden) {
      const fecha = hoy();
      const [{ clientes, porCliente }, u, ctx] = await Promise.all([
        cartera(),
        umbral(),
        recargoCtx(),
      ]);
      const views = clientes
        .filter((c) => !q || coincideNombre(c.nombre, q))
        .map((c) => clienteView(c, porCliente.get(c.id) ?? [], fecha, u, ctx));
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
      const [u, ctx] = await Promise.all([umbral(), recargoCtx(c.id)]);
      return clienteView(c, [], hoy(), u, ctx);
    },

    async ficha(clienteId) {
      return fichaDe(clienteId);
    },

    async actualizarCliente(clienteId, patch) {
      const actual = await clienteOr404(clienteId);
      const data: Prisma.fiado_clientesUpdateInput = {};
      if (patch.nombre !== undefined) data.nombre = patch.nombre;
      if (patch.telefono !== undefined) data.telefono = patch.telefono;
      if (patch.etiqueta !== undefined) data.etiqueta = patch.etiqueta;
      if (patch.limite !== undefined) data.limite = patch.limite;
      if (patch.proximo_cobro !== undefined) data.proximo_cobro = toDate(patch.proximo_cobro);
      if (patch.sin_recargo !== undefined) {
        data.sin_recargo = patch.sin_recargo;
        // Volver a activarle recargos obliga a avisarle de nuevo.
        if (actual.sin_recargo && !patch.sin_recargo) data.recargo_aviso_version = 0;
      }
      const c = await prisma.fiado_clientes.update({ where: { id: clienteId }, data });
      const [movs, u, ctx] = await Promise.all([
        movimientosDe(clienteId),
        umbral(),
        recargoCtx(clienteId),
      ]);
      return clienteView(c, movs.map(toLedger), hoy(), u, ctx);
    },

    async crearMovimiento(input) {
      const cliente = await clienteOr404(input.cliente_id);
      if (input.idempotency_key) {
        const previo = await prisma.fiado_movimientos.findFirst({
          where: { user_id: uid(), idempotency_key: input.idempotency_key },
        });
        if (previo) return resultado(previo, cliente);
      }
      if (input.tipo === 'fiado' && avisoPendiente(cliente, await recargoCtx(cliente.id))) {
        throw new FiadoError(409, 'Antes de anotarle un fiado, avisale las condiciones de recargo');
      }
      try {
        const mov = await prisma.fiado_movimientos.create({
          data: {
            user_id: uid(),
            cliente_id: cliente.id,
            tipo: input.tipo,
            monto: montoConSigno(input.tipo, input.monto),
            nota: input.nota,
            vence: toDate(input.vence),
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
      // Deshacer un fiado deshace también sus recargos vigentes (si no, quedaría
      // un recargo sobre una deuda que no existe). Todo en un solo INSERT.
      const recargos =
        original.tipo === 'fiado'
          ? await prisma.fiado_movimientos.findMany({
              where: { user_id: uid(), recargo_de: original.id, corregido: { is: null } },
            })
          : [];
      const correccion = (m: { id: number; monto: number }) => ({
        user_id: uid(),
        cliente_id: original.cliente_id,
        tipo: 'correccion',
        monto: -m.monto,
        corrige_id: m.id,
      });
      try {
        const creadas = await prisma.fiado_movimientos.createManyAndReturn({
          data: [{ ...correccion(original), monto }, ...recargos.map(correccion)],
        });
        const mov = creadas.find((m) => m.corrige_id === original.id) as MovRow;
        return resultado(mov, cliente);
      } catch (err) {
        if (isUniqueViolation(err, 'corrige_id')) {
          throw new FiadoError(409, 'Ese movimiento ya fue corregido');
        }
        throw err;
      }
    },

    async perdonarRecargo(movimientoId) {
      const recargo = await prisma.fiado_movimientos.findFirst({
        where: { id: movimientoId, user_id: uid(), tipo: 'recargo' },
      });
      if (!recargo || recargo.recargo_de == null || recargo.recargo_dias == null) {
        throw new FiadoError(404, 'Recargo no encontrado');
      }
      // Primero "No cobrar" (si ya estaba, no pasa nada) y después la corrección:
      // si la corrección fallara, el período queda omitido y el recargo vigente,
      // que se puede volver a perdonar.
      try {
        await prisma.fiado_recargo_omisiones.create({
          data: {
            user_id: uid(),
            cliente_id: recargo.cliente_id,
            fiado_id: recargo.recargo_de,
            dias: recargo.recargo_dias,
          },
        });
      } catch (err) {
        if (!isUniqueViolation(err, 'fiado_id')) throw err;
      }
      return this.corregirMovimiento(movimientoId);
    },

    async registrarRecordatorio(clienteId) {
      await clienteOr404(clienteId);
      const r = await prisma.fiado_recordatorios.create({
        data: { user_id: uid(), cliente_id: clienteId },
      });
      return { cliente_id: r.cliente_id, enviado_at: r.enviado_at.toISOString() };
    },

    async getAjustes() {
      const [row, aceptados] = await Promise.all([ajustesRow(), aceptoTerminos()]);
      return ajustesView(row, aceptados);
    },

    async putAjustes(input) {
      const { recargo, terminos_recargo, ...resto } = input;
      let aceptados = await aceptoTerminos();
      let deRecargo: {
        recargo?: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue;
        recargo_version?: number;
      } = {};
      if (recargo !== undefined) {
        const actual = await ajustesRow();
        const anterior = configDe(actual?.recargo);
        const nuevo = parseConfigRecargo(recargo, hoy(), anterior);
        // Para tener recargos activos hay que aceptar los términos vigentes
        // (quedan registrados, con fecha, en una tabla append-only).
        if (nuevo !== null && !aceptados) {
          if (!terminos_recargo) {
            throw new FiadoError(409, 'Para activar los recargos tenés que aceptar los términos');
          }
          if (terminos_recargo !== TERMINOS_RECARGO_VERSION) {
            throw new FiadoError(409, 'Los términos cambiaron: volvé a abrir Ajustes y aceptalos');
          }
          await prisma.fiado_terminos_aceptados.create({
            data: { user_id: uid(), documento: 'recargo', version: terminos_recargo },
          });
          aceptados = true;
        }
        // Activar o empeorar las condiciones deja a todos los clientes pendientes de aviso.
        const version = (actual?.recargo_version ?? 0) + (requiereAviso(anterior, nuevo) ? 1 : 0);
        deRecargo = {
          recargo: nuevo === null ? Prisma.DbNull : (nuevo as unknown as Prisma.InputJsonValue),
          recargo_version: version,
        };
      }
      const row = await prisma.fiado_ajustes.upsert({
        where: { user_id: uid() },
        create: {
          user_id: uid(),
          ...resto,
          comercio: resto.comercio ?? '',
          ...deRecargo,
        },
        update: { ...resto, ...deRecargo },
      });
      return ajustesView(row, aceptados);
    },

    async sumarRecargos(clienteId, fiadoIds, idempotencyKey) {
      const cliente = await clienteOr404(clienteId);
      const clave = (fiadoId: number) => (idempotencyKey ? `${idempotencyKey}:${fiadoId}` : null);
      const previos = async () =>
        idempotencyKey
          ? prisma.fiado_movimientos.findMany({
              where: { user_id: uid(), idempotency_key: { startsWith: `${idempotencyKey}:` } },
              orderBy: { id: 'asc' },
            })
          : [];
      // Doble toque o reintento: devolver lo que ya se anotó.
      const ya = await previos();
      if (ya.length > 0) return resultadoVarios(ya, cliente);

      const estado = await recargoActual(cliente);
      if (!estado) throw new FiadoError(409, 'Los recargos no están activos para este cliente');
      if (estado.aviso) {
        throw new FiadoError(409, 'Antes de sumarle recargos, avisale las condiciones');
      }
      let elegidos = estado.sugeridos;
      if (fiadoIds) {
        const pedidos = new Set(fiadoIds);
        elegidos = estado.sugeridos.filter((r) => pedidos.has(r.fiado_id));
        if (elegidos.length !== pedidos.size) {
          throw new FiadoError(409, 'Los recargos cambiaron: volvé a abrir la ficha');
        }
      }
      if (elegidos.length === 0) throw new FiadoError(409, 'No hay recargos para sumar');

      try {
        const creados = await prisma.fiado_movimientos.createManyAndReturn({
          data: elegidos.map((r) => ({
            user_id: uid(),
            cliente_id: cliente.id,
            tipo: 'recargo',
            monto: r.monto,
            recargo_de: r.fiado_id,
            recargo_dias: r.dias_atraso,
            nota: r.detalle,
            idempotency_key: clave(r.fiado_id),
          })),
        });
        return resultadoVarios(creados, cliente);
      } catch (err) {
        // Dos envíos simultáneos con la misma clave: devolver los del que ganó.
        if (idempotencyKey && isUniqueViolation(err, 'idempotency_key')) {
          const ganador = await previos();
          if (ganador.length > 0) return resultadoVarios(ganador, cliente);
        }
        throw err;
      }
    },

    async omitirRecargo(clienteId, fiadoId) {
      const cliente = await clienteOr404(clienteId);
      const estado = await recargoActual(cliente);
      const sugerido = estado?.sugeridos.find((r) => r.fiado_id === fiadoId);
      if (!sugerido) throw new FiadoError(409, 'Ese recargo ya no está para sumar');
      try {
        await prisma.fiado_recargo_omisiones.create({
          data: {
            user_id: uid(),
            cliente_id: cliente.id,
            fiado_id: fiadoId,
            dias: sugerido.dias_atraso,
          },
        });
      } catch (err) {
        // Ya estaba omitido (doble toque): no es un error.
        if (!isUniqueViolation(err, 'fiado_id')) throw err;
      }
      return fichaDe(clienteId);
    },

    async registrarAvisoRecargo(clienteId, via) {
      const cliente = await clienteOr404(clienteId);
      const ctx = await recargoCtx(clienteId);
      if (!ctx.config) throw new FiadoError(409, 'Los recargos están apagados');
      if (cliente.sin_recargo) throw new FiadoError(409, 'Este cliente no tiene recargos');
      const aviso = await prisma.fiado_avisos_recargo.create({
        data: {
          user_id: uid(),
          cliente_id: cliente.id,
          version: ctx.version,
          condiciones: textoAvisoRecargo(ctx.config, ctx.comercio, cliente.nombre),
          via,
        },
      });
      await prisma.fiado_clientes.update({
        where: { id: cliente.id },
        data: { recargo_aviso_version: ctx.version },
      });
      return {
        cliente_id: aviso.cliente_id,
        version: aviso.version,
        condiciones: aviso.condiciones,
        via,
        created_at: aviso.created_at.toISOString(),
      };
    },
  };
}
