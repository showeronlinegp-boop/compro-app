import { describe, expect, it } from 'vitest';
import {
  type ActividadSemanal,
  type ComercioHechos,
  type DatosUso,
  adopcion,
  armarReporte,
  cohortes,
  embudo,
  lunesDe,
  parseSemanas,
  primeraSemana,
  serieSemanal,
  ultimasSemanas,
} from './uso.js';

/** Mediodía en Argentina (UTC−3) del día `ymd`. */
const ar = (ymd: string) => new Date(`${ymd}T15:00:00Z`);

function comercio(over: Partial<ComercioHechos> = {}): ComercioHechos {
  return {
    user_id: 1,
    clerk_user_id: 'user_1',
    email: 'a@b.c',
    comercio: null,
    alias: false,
    plantillas_propias: 0,
    alta: ar('2026-10-05'),
    clientes: 0,
    clientes_con_telefono: 0,
    clientes_con_limite: 0,
    clientes_con_etiqueta: 0,
    clientes_con_proximo_cobro: 0,
    fiados: 0,
    fiados_con_vence: 0,
    pagos: 0,
    correcciones: 0,
    recordatorios: 0,
    primer_cliente: null,
    primer_fiado: null,
    primer_pago: null,
    primer_recordatorio: null,
    ultima_actividad: null,
    comprobantes: 0,
    ultima_vista: null,
    uso_instalada: false,
    uso_movil: false,
    ...over,
  };
}

describe('parseSemanas', () => {
  it('sin valor → 12', () => {
    expect(parseSemanas(undefined)).toBe(12);
    expect(parseSemanas('')).toBe(12);
  });

  it('acepta 1..52 y rechaza el resto', () => {
    expect(parseSemanas('1')).toBe(1);
    expect(parseSemanas('52')).toBe(52);
    expect(parseSemanas('0')).toBeNull();
    expect(parseSemanas('53')).toBeNull();
    expect(parseSemanas('2.5')).toBeNull();
    expect(parseSemanas('abc')).toBeNull();
  });
});

describe('semanas', () => {
  it('lunesDe: la semana empieza el lunes', () => {
    expect(lunesDe('2026-10-26')).toBe('2026-10-26'); // lunes
    expect(lunesDe('2026-10-29')).toBe('2026-10-26'); // jueves
    expect(lunesDe('2026-11-01')).toBe('2026-10-26'); // domingo
  });

  it('ultimasSemanas: n lunes, del más viejo a la semana actual', () => {
    expect(ultimasSemanas('2026-10-29', 3)).toEqual(['2026-10-12', '2026-10-19', '2026-10-26']);
    expect(primeraSemana('2026-10-29', 3)).toBe('2026-10-12');
  });
});

describe('serieSemanal', () => {
  it('cuenta comercios distintos por semana y por acción, y las altas', () => {
    const comercios = [
      comercio({ user_id: 1, alta: ar('2026-10-13') }),
      comercio({ user_id: 2, alta: ar('2026-10-20') }),
    ];
    const actividad: ActividadSemanal[] = [
      { user_id: 1, semana: '2026-10-12', accion: 'cliente' },
      { user_id: 1, semana: '2026-10-12', accion: 'fiado' },
      { user_id: 1, semana: '2026-10-19', accion: 'pago' },
      { user_id: 2, semana: '2026-10-19', accion: 'fiado' },
    ];
    const aperturas = [
      { user_id: 1, semana: '2026-10-19' },
      { user_id: 2, semana: '2026-10-19' },
    ];
    const [s1, s2] = serieSemanal(comercios, actividad, aperturas, ['2026-10-12', '2026-10-19']);
    expect(s1).toMatchObject({ semana: '2026-10-12', altas: 1, activos: 1, abrieron: 0 });
    expect(s1?.por_accion).toEqual({
      cliente: 1,
      fiado: 1,
      pago: 0,
      correccion: 0,
      recordatorio: 0,
    });
    expect(s2).toMatchObject({ semana: '2026-10-19', altas: 1, activos: 2, abrieron: 2 });
    expect(s2?.por_accion.fiado).toBe(1);
    expect(s2?.por_accion.pago).toBe(1);
  });

  it('el alta se cuenta en hora argentina (domingo 23:30 AR sigue siendo esa semana)', () => {
    const domingoNoche = new Date('2026-10-19T02:30:00Z'); // dom 18/10 23:30 AR
    const [s] = serieSemanal([comercio({ alta: domingoNoche })], [], [], ['2026-10-12']);
    expect(s?.altas).toBe(1);
  });
});

describe('cohortes', () => {
  it('retención por semana desde el alta hasta la semana actual', () => {
    const comercios = [
      comercio({ user_id: 1, alta: ar('2026-10-13') }),
      comercio({ user_id: 2, alta: ar('2026-10-14') }),
      comercio({ user_id: 3, alta: ar('2026-10-21') }),
    ];
    const actividad: ActividadSemanal[] = [
      { user_id: 1, semana: '2026-10-12', accion: 'cliente' },
      { user_id: 2, semana: '2026-10-12', accion: 'cliente' },
      { user_id: 1, semana: '2026-10-19', accion: 'fiado' },
      { user_id: 1, semana: '2026-10-19', accion: 'pago' },
    ];
    expect(cohortes(comercios, actividad, ['2026-10-12', '2026-10-19'])).toEqual([
      { semana: '2026-10-12', comercios: 2, retencion: [2, 1] },
      { semana: '2026-10-19', comercios: 1, retencion: [0] },
    ]);
  });
});

describe('embudo y adopción', () => {
  const d = ar('2026-10-13');
  const comercios = [
    comercio({ user_id: 1 }),
    comercio({ user_id: 2, comercio: '  ', primer_cliente: d }),
    comercio({
      user_id: 3,
      comercio: 'Almacén',
      primer_cliente: d,
      primer_fiado: d,
      fiados: 3,
      fiados_con_vence: 1,
      clientes_con_telefono: 2,
      alias: true,
    }),
    comercio({
      user_id: 4,
      comercio: 'Kiosco',
      primer_cliente: d,
      primer_fiado: d,
      primer_pago: d,
      primer_recordatorio: d,
      fiados: 1,
      pagos: 1,
      recordatorios: 2,
      plantillas_propias: 2,
      comprobantes: 3,
      uso_instalada: true,
    }),
  ];

  it('embudo: cuántos llegaron a cada paso (nombre en blanco no cuenta)', () => {
    expect(embudo(comercios).map((p) => p.comercios)).toEqual([4, 2, 3, 2, 1, 1]);
  });

  it('adopción: sobre los que anotaron algún fiado', () => {
    const porFuncion = Object.fromEntries(adopcion(comercios).map((a) => [a.funcion, a]));
    expect(porFuncion['Fecha de cobro en el fiado']).toEqual({
      funcion: 'Fecha de cobro en el fiado',
      comercios: 1,
      de: 2,
    });
    expect(porFuncion.Recordatorios?.comercios).toBe(1);
    expect(porFuncion['Alias para cobrar']?.comercios).toBe(1);
    expect(porFuncion['Mensajes personalizados']?.comercios).toBe(1);
    expect(porFuncion['Límite de fiado']?.comercios).toBe(0);
    expect(porFuncion['Comprobante por WhatsApp']?.comercios).toBe(1);
    expect(porFuncion['App instalada']?.comercios).toBe(1);
  });
});

describe('armarReporte', () => {
  const ahora = new Date('2026-10-29T15:00:00Z');
  const comercios = [
    comercio({
      user_id: 1,
      clerk_user_id: 'user_1',
      comercio: ' Almacén ',
      ultima_actividad: new Date('2026-10-28T12:00:00Z'),
    }),
    comercio({
      user_id: 2,
      clerk_user_id: 'user_2',
      ultima_actividad: new Date('2026-10-10T12:00:00Z'),
    }),
    comercio({
      user_id: 3,
      clerk_user_id: 'user_3',
      ultima_vista: new Date('2026-10-27T12:00:00Z'),
      uso_instalada: true,
      uso_movil: true,
    }),
  ];
  const datos = (over: Partial<DatosUso> = {}): DatosUso => ({
    comercios,
    actividad: [],
    aperturas: [],
    pantallas: [],
    eventos_desde: null,
    ingresos: null,
    ...over,
  });

  it('activos por última actividad y orden por actividad más reciente', () => {
    const r = armarReporte(datos(), 4, ahora);
    expect(r.totales).toEqual({
      comercios: 3,
      activos_7d: 1,
      activos_30d: 2,
      ingresaron_7d: null,
      abrieron_7d: 1,
      usan_instalada: 1,
      usan_celular: 1,
    });
    expect(r.comercios.map((c) => c.user_id)).toEqual([1, 2, 3]);
    expect(r.comercios[0]?.comercio).toBe('Almacén');
    expect(r.semanal.map((s) => s.semana)).toEqual([
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
    ]);
  });

  it('sin Clerk: ingresos no disponibles y sin último ingreso', () => {
    const r = armarReporte(datos(), 4, ahora);
    expect(r.ingresos).toBe('no_disponible');
    expect(r.comercios[0]?.ultimo_ingreso).toBeNull();
  });

  it('con Clerk: cuenta los que abrieron la app en 7 días aunque no hayan anotado nada', () => {
    const ingresos = new Map([
      ['user_2', { last_active_at: new Date('2026-10-27T00:00:00Z'), last_sign_in_at: null }],
      ['user_3', { last_active_at: new Date('2026-09-01T00:00:00Z'), last_sign_in_at: null }],
    ]);
    const r = armarReporte(datos({ ingresos }), 4, ahora);
    expect(r.ingresos).toBe('clerk');
    expect(r.totales.ingresaron_7d).toBe(1);
    expect(r.comercios.find((c) => c.user_id === 2)?.ultimo_ingreso).toBe(
      '2026-10-27T00:00:00.000Z',
    );
  });
});

describe('armarReporte con eventos de uso', () => {
  it('pasa las pantallas, la fecha desde que se mide y los datos de cada comercio', () => {
    const pantallas = [{ modulo: 'fiado', ruta_id: 'inicio', vistas: 9, comercios: 2 }];
    const r = armarReporte(
      {
        comercios: [
          comercio({ comprobantes: 2, uso_instalada: true, ultima_vista: ar('2026-10-28') }),
        ],
        actividad: [],
        aperturas: [],
        pantallas,
        eventos_desde: new Date('2026-10-29T03:00:00Z'),
        ingresos: null,
      },
      2,
      new Date('2026-10-29T15:00:00Z'),
    );
    expect(r.eventos_desde).toBe('2026-10-29T03:00:00.000Z');
    expect(r.pantallas).toEqual(pantallas);
    expect(r.comercios[0]).toMatchObject({
      comprobantes: 2,
      instalada: true,
      ultima_vista: '2026-10-28T15:00:00.000Z',
    });
  });

  it('sin eventos todavía: eventos_desde null y nadie abrió', () => {
    const r = armarReporte(
      {
        comercios: [comercio()],
        actividad: [],
        aperturas: [],
        pantallas: [],
        eventos_desde: null,
        ingresos: null,
      },
      2,
      new Date('2026-10-29T15:00:00Z'),
    );
    expect(r.eventos_desde).toBeNull();
    expect(r.totales.abrieron_7d).toBe(0);
    expect(r.semanal.every((s) => s.abrieron === 0)).toBe(true);
  });
});
