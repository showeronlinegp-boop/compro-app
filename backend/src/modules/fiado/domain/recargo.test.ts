import { describe, expect, it } from 'vitest';
import { FiadoError, type MovimientoLedger, imputarFiados, recargosPendientes } from './fiado.js';
import {
  type ConfigRecargo,
  type FiadoParaRecargo,
  condicionesTexto,
  parseConfigRecargo,
  periodoDe,
  recargosSugeridos,
  redondear10,
  requiereAviso,
  textoAvisoRecargo,
} from './recargo.js';

const base = { tolerancia: 7, desde: 'vencimiento', activado_el: '2026-01-01' } as const;
const mes5: ConfigRecargo = { ...base, esquema: 'mes', tipo: 'pct', valor: 5 };
const mesFijo: ConfigRecargo = { ...base, esquema: 'mes', tipo: 'fijo', valor: 500 };
const semana1: ConfigRecargo = { ...base, esquema: 'semana', tipo: 'pct', valor: 1 };
const tramos: ConfigRecargo = {
  ...base,
  esquema: 'tramos',
  tramos: [
    { hasta: 30, pct: 5 },
    { hasta: 60, pct: 10 },
    { hasta: null, pct: 20 },
  ],
};

/** Un fiado de $ 28.000 vencido el 1/10 (como el ejemplo de la propuesta). */
const fiado = (over: Partial<FiadoParaRecargo> = {}): FiadoParaRecargo => ({
  id: 1,
  fecha: '2026-09-01',
  vence: '2026-10-01',
  pendiente: 28_000,
  ...over,
});
const diaDeAtraso = (n: number) => {
  const d = new Date(Date.parse('2026-10-01T00:00:00Z') + n * 86_400_000);
  return d.toISOString().slice(0, 10);
};
/** `tratado` = días de atraso ya cubiertos por un recargo o un "No cobrar". */
const sugerir = (c: ConfigRecargo, dia: number, tratado = 0, f = fiado()) =>
  recargosSugeridos([f], new Map(tratado ? [[f.id, tratado]] : []), c, diaDeAtraso(dia));

describe('períodos y redondeo', () => {
  it('mes = cada 30 días, semana = cada 7, tramos = índice', () => {
    expect([1, 30, 31, 60, 61].map((d) => periodoDe(d, mes5))).toEqual([1, 1, 2, 2, 3]);
    expect([1, 7, 8, 14, 15].map((d) => periodoDe(d, semana1))).toEqual([1, 1, 2, 2, 3]);
    expect([1, 30, 31, 60, 61, 400].map((d) => periodoDe(d, tramos))).toEqual([1, 1, 2, 2, 3, 3]);
    expect(periodoDe(0, mes5)).toBe(0);
  });

  it('redondea a múltiplos de $ 10 hacia abajo', () => {
    expect(redondear10(1437)).toBe(1430);
    expect(redondear10(1440)).toBe(1440);
    expect(redondear10(9)).toBe(0);
  });
});

describe('sugerencia: la tabla de la propuesta ($ 28.000 vencidos, 7 días de gracia)', () => {
  it('durante la gracia no hay sugerencia', () => {
    expect(sugerir(mes5, 7)).toEqual([]);
    expect(sugerir(mes5, 8)).toHaveLength(1);
  });

  it('5 % por mes: 1.400 el día 14, +1.400 el 31, +1.400 el 61', () => {
    expect(sugerir(mes5, 14)[0]).toMatchObject({ monto: 1400, periodo_desde: 1, periodo_hasta: 1 });
    expect(sugerir(mes5, 14, 14)).toEqual([]); // el mes 1 ya está tratado
    expect(sugerir(mes5, 31, 14)[0]).toMatchObject({ monto: 1400, periodo_hasta: 2 });
    expect(sugerir(mes5, 61, 31)[0]).toMatchObject({ monto: 1400, periodo_hasta: 3 });
  });

  it('$ 500 por mes', () => {
    expect(sugerir(mesFijo, 14)[0]?.monto).toBe(500);
    expect(sugerir(mesFijo, 31, 14)[0]?.monto).toBe(500);
  });

  it('1 % por semana: 560 el día 14, +840 el 31, +1.120 el 61', () => {
    expect(sugerir(semana1, 14)[0]?.monto).toBe(560);
    expect(sugerir(semana1, 31, 14)[0]?.monto).toBe(840);
    expect(sugerir(semana1, 61, 31)[0]?.monto).toBe(1120);
  });

  it('tramos 5/10/20 %: 1.400, +1.400 y +2.800 (el % del tramo es el total)', () => {
    expect(sugerir(tramos, 14)[0]).toMatchObject({ monto: 1400, periodo_hasta: 1 });
    expect(sugerir(tramos, 31, 14)[0]).toMatchObject({ monto: 1400, periodo_hasta: 2 });
    expect(sugerir(tramos, 61, 31)[0]).toMatchObject({ monto: 2800, periodo_hasta: 3 });
    expect(sugerir(tramos, 400, 61)).toEqual([]); // después del último tramo no hay más
  });

  it('varios períodos sin tratar se suman en una sola sugerencia', () => {
    expect(sugerir(mes5, 61)[0]).toMatchObject({ monto: 4200, periodo_desde: 1, periodo_hasta: 3 });
    expect(sugerir(tramos, 61)[0]).toMatchObject({
      monto: 5600,
      periodo_desde: 1,
      periodo_hasta: 3,
    });
  });

  it('un pago parcial achica los períodos siguientes, sin borrar ninguno', () => {
    // Mes 1 ya sumado sobre 28.000; pagó 14.000: el mes 2 es 5 % de lo que falta.
    expect(sugerir(mes5, 31, 14, fiado({ pendiente: 14_000 }))[0]?.monto).toBe(700);
  });

  it('un fiado pagado no genera recargo', () => {
    expect(sugerir(mes5, 40, 0, fiado({ pendiente: 0 }))).toEqual([]);
  });

  it('si el redondeo da $ 0 no se sugiere nada', () => {
    expect(sugerir(mes5, 14, 0, fiado({ pendiente: 150 }))).toEqual([]);
  });

  it('cada fiado tiene su propio calendario', () => {
    const a = fiado({ id: 1, vence: '2026-10-15', pendiente: 12_000 });
    const b = fiado({ id: 2, vence: '2026-10-20', pendiente: 16_000 });
    // 25/10: A lleva 10 días (pasó la gracia), B lleva 5 (todavía no).
    expect(recargosSugeridos([a, b], new Map(), mes5, '2026-10-25').map((s) => s.fiado_id)).toEqual(
      [1],
    );
    // 29/10: los dos en su mes 1 → $ 600 y $ 800.
    expect(
      recargosSugeridos([a, b], new Map(), mes5, '2026-10-29').map((s) => [s.fiado_id, s.monto]),
    ).toEqual([
      [1, 600],
      [2, 800],
    ]);
    // 14/11 es el día 30 de A: sigue en el mes 1. El 15/11 (día 31) entra en el 2; B sigue en el 1.
    const tratados = new Map([
      [1, 14],
      [2, 9],
    ]);
    expect(recargosSugeridos([a, b], tratados, mes5, '2026-11-14')).toEqual([]);
    expect(recargosSugeridos([a, b], tratados, mes5, '2026-11-15').map((s) => s.fiado_id)).toEqual([
      1,
    ]);
  });

  it('"desde la activación": los días de deudas viejas se cuentan desde ese día', () => {
    const c: ConfigRecargo = { ...mes5, desde: 'activacion', activado_el: '2026-12-01' };
    // Vencido el 1/10 pero activado el 1/12: el 10/12 lleva 9 días, mes 1 (no el 3).
    const s = recargosSugeridos([fiado()], new Map(), c, '2026-12-10');
    expect(s[0]).toMatchObject({ dias_atraso: 9, periodo_hasta: 1, monto: 1400 });
    // Un fiado que vence después de activar se cuenta desde su vencimiento.
    const nuevo = fiado({ vence: '2026-12-05' });
    expect(recargosSugeridos([nuevo], new Map(), c, '2026-12-10')).toEqual([]);
  });

  it('cambiar de esquema no confunde períodos: se guardan los días cubiertos', () => {
    // Sumado por semanas hasta el día 70 ("semana 10"); después pasa a "por mes".
    // Con días, eso cubre hasta el mes 3: el día 80 no hay nada (mes 3), el 91 sí (mes 4).
    expect(sugerir(mes5, 80, 70)).toEqual([]);
    expect(sugerir(mes5, 91, 70)[0]).toMatchObject({
      periodo_desde: 4,
      periodo_hasta: 4,
      monto: 1400,
    });
    // Y de mes a tramos: lo cubierto hasta el día 45 (mes 2) es el tramo 2 (31 a 60).
    expect(sugerir(tramos, 50, 45)).toEqual([]);
    expect(sugerir(tramos, 61, 45)[0]).toMatchObject({ periodo_hasta: 3, monto: 2800 });
  });

  it('el detalle explica la cuenta', () => {
    expect(sugerir(mes5, 14)[0]?.detalle).toBe('5 % de $ 28.000 · mes 1');
    expect(sugerir(mes5, 61)[0]?.detalle).toBe('5 % de $ 28.000 · meses 1 a 3');
    expect(sugerir(tramos, 31, 14)[0]?.detalle).toBe(
      '10 % de $ 28.000 menos el tramo anterior (5 %) · 31 a 60 días',
    );
  });
});

describe('textos', () => {
  it('condiciones en una frase', () => {
    expect(condicionesTexto(mes5)).toBe(
      'un recargo del 5 % por cada mes de atraso, después de 7 días de gracia',
    );
    expect(condicionesTexto({ ...mesFijo, tolerancia: 0 })).toBe(
      'un recargo de $ 500 por cada mes de atraso, desde el día siguiente al vencimiento',
    );
    expect(condicionesTexto({ ...semana1, valor: 2.5, tolerancia: 1 })).toBe(
      'un recargo del 2,5 % por cada semana de atraso, después de 1 día de gracia',
    );
    expect(condicionesTexto(tramos)).toBe(
      'un recargo del 5 % hasta los 30 días, del 10 % de 31 a 60 días y del 20 % con más de 60 días de atraso (en total, no se suman), después de 7 días de gracia',
    );
  });

  it('aviso al cliente, con el primer nombre y la firma', () => {
    expect(textoAvisoRecargo(mes5, 'Almacén Don Pepe', 'Marta Giménez')).toBe(
      'Hola Marta, te aviso que en Almacén Don Pepe los fiados que se atrasen tienen un recargo del 5 % por cada mes de atraso, después de 7 días de gracia.\n\nHecho con Neggo',
    );
    expect(textoAvisoRecargo(mes5, '  ', 'Marta')).toContain('en mi comercio');
  });
});

describe('cuándo hay que volver a avisar', () => {
  it('sí: activar, subir, cambiar de esquema o de tipo, achicar la gracia', () => {
    expect(requiereAviso(null, mes5)).toBe(true);
    expect(requiereAviso(mes5, { ...mes5, valor: 6 })).toBe(true);
    expect(requiereAviso(mes5, semana1)).toBe(true);
    expect(requiereAviso(mes5, { ...mes5, tipo: 'fijo', valor: 100 })).toBe(true);
    expect(requiereAviso(mes5, { ...mes5, tolerancia: 3 })).toBe(true);
    expect(requiereAviso({ ...mes5, desde: 'activacion' }, mes5)).toBe(true);
    const t = tramos.tramos ?? [];
    expect(
      requiereAviso(tramos, { ...tramos, tramos: [t[0], { hasta: 60, pct: 12 }, t[2]] as never }),
    ).toBe(true);
    expect(
      requiereAviso(tramos, { ...tramos, tramos: [{ hasta: 20, pct: 5 }, t[1], t[2]] as never }),
    ).toBe(true);
  });

  it('no: apagar, bajar o alargar la gracia', () => {
    expect(requiereAviso(mes5, null)).toBe(false);
    expect(requiereAviso(mes5, { ...mes5, valor: 3 })).toBe(false);
    expect(requiereAviso(mes5, { ...mes5, tolerancia: 10 })).toBe(false);
    expect(requiereAviso(mes5, mes5)).toBe(false);
    const t = tramos.tramos ?? [];
    expect(
      requiereAviso(tramos, { ...tramos, tramos: [t[0], { hasta: 60, pct: 8 }, t[2]] as never }),
    ).toBe(false);
  });
});

describe('parseConfigRecargo', () => {
  const hoy = '2026-10-30';

  it('acepta mes/semana con % o fijo y pone la fecha de activación', () => {
    expect(
      parseConfigRecargo({ esquema: 'mes', tipo: 'pct', valor: 5, tolerancia: 7 }, hoy, null),
    ).toEqual({
      esquema: 'mes',
      tipo: 'pct',
      valor: 5,
      tolerancia: 7,
      desde: 'vencimiento',
      activado_el: hoy,
    });
    expect(
      parseConfigRecargo(
        { esquema: 'semana', tipo: 'fijo', valor: 200, tolerancia: 0, desde: 'activacion' },
        hoy,
        null,
      ),
    ).toMatchObject({ tipo: 'fijo', valor: 200, desde: 'activacion' });
  });

  it('al cambiar la configuración conserva la fecha de activación', () => {
    expect(
      parseConfigRecargo({ esquema: 'mes', tipo: 'pct', valor: 3 }, hoy, mes5)?.activado_el,
    ).toBe('2026-01-01');
  });

  it('null apaga', () => {
    expect(parseConfigRecargo(null, hoy, mes5)).toBeNull();
  });

  it('acepta hasta 3 tramos crecientes; el último puede no tener fin', () => {
    const t = parseConfigRecargo(
      { esquema: 'tramos', tramos: [{ hasta: 30, pct: 5 }, { pct: 10 }], tolerancia: 5 },
      hoy,
      null,
    );
    expect(t?.tramos).toEqual([
      { hasta: 30, pct: 5 },
      { hasta: null, pct: 10 },
    ]);
  });

  it.each([
    ['esquema desconocido', { esquema: 'dia', tipo: 'pct', valor: 1 }],
    ['sin tipo', { esquema: 'mes', valor: 5 }],
    ['porcentaje 0', { esquema: 'mes', tipo: 'pct', valor: 0 }],
    ['porcentaje con 3 decimales', { esquema: 'mes', tipo: 'pct', valor: 1.234 }],
    ['fijo menor a $ 10', { esquema: 'mes', tipo: 'fijo', valor: 5 }],
    ['fijo con decimales', { esquema: 'mes', tipo: 'fijo', valor: 10.5 }],
    ['tolerancia negativa', { esquema: 'mes', tipo: 'pct', valor: 5, tolerancia: -1 }],
    [
      '4 tramos',
      {
        esquema: 'tramos',
        tramos: [{ hasta: 1, pct: 1 }, { hasta: 2, pct: 2 }, { hasta: 3, pct: 3 }, { pct: 4 }],
      },
    ],
    [
      'tramos desordenados',
      {
        esquema: 'tramos',
        tramos: [
          { hasta: 60, pct: 5 },
          { hasta: 30, pct: 10 },
        ],
      },
    ],
    ['tramo que baja el %', { esquema: 'tramos', tramos: [{ hasta: 30, pct: 10 }, { pct: 5 }] }],
    ['tramo del medio sin fin', { esquema: 'tramos', tramos: [{ pct: 5 }, { pct: 10 }] }],
    ['desde inválido', { esquema: 'mes', tipo: 'pct', valor: 5, desde: 'ayer' }],
  ])('rechaza: %s', (_caso, body) => {
    expect(() => parseConfigRecargo(body, hoy, null)).toThrow(FiadoError);
  });
});

describe('imputación con recargos: primero la deuda, después su recargo', () => {
  let seq = 100;
  const mov = (
    tipo: MovimientoLedger['tipo'],
    monto: number,
    fecha: string,
    extra: Partial<MovimientoLedger> = {},
  ): MovimientoLedger => {
    seq += 1;
    return {
      id: seq,
      cliente_id: 1,
      tipo,
      monto,
      corrige_id: null,
      vence: null,
      created_at: new Date(`${fecha}T15:00:00Z`),
      ...extra,
    };
  };

  it('el ejemplo de Marta: paga $ 20.000 y quedan $ 8.600 del 2.º fiado y su recargo', () => {
    const a = mov('fiado', 12_000, '2026-09-15', { vence: '2026-10-15' });
    const b = mov('fiado', 16_000, '2026-10-02', { vence: '2026-10-20' });
    const c = mov('fiado', 14_300, '2026-10-20', { vence: '2026-11-01' });
    const ra = mov('recargo', 600, '2026-10-29', { recargo_de: a.id, recargo_dias: 14 });
    const rb = mov('recargo', 800, '2026-10-29', { recargo_de: b.id, recargo_dias: 14 });
    const pago = mov('pago', -20_000, '2026-11-03');
    const p = imputarFiados([a, b, c, ra, rb, pago], 30);
    expect(p.map((x) => [x.id, x.pendiente])).toEqual([
      [a.id, 0],
      [ra.id, 0],
      [b.id, 8_600],
      [rb.id, 800],
      [c.id, 14_300],
    ]);
    expect(p.find((x) => x.id === rb.id)).toMatchObject({ recargo_de: b.id, vence: '2026-10-29' });
    expect(recargosPendientes(p)).toBe(800);
  });

  it('un recargo perdonado (corregido) no cuenta', () => {
    const a = mov('fiado', 1000, '2026-09-01', { vence: '2026-10-01' });
    const r = mov('recargo', 50, '2026-10-20', { recargo_de: a.id, recargo_dias: 14 });
    const corr = mov('correccion', -50, '2026-10-21', { corrige_id: r.id });
    expect(imputarFiados([a, r, corr], 30).map((x) => x.id)).toEqual([a.id]);
  });

  it('sin recargos la imputación es la de siempre', () => {
    const a = mov('fiado', 1000, '2026-10-01', { vence: '2026-10-30' });
    const b = mov('fiado', 800, '2026-10-05', { vence: '2026-10-12' });
    const pago = mov('pago', -1200, '2026-10-12');
    expect(imputarFiados([a, b, pago], 30)).toEqual([
      { id: b.id, vence: '2026-10-12', pendiente: 0, recargo_de: null },
      { id: a.id, vence: '2026-10-30', pendiente: 600, recargo_de: null },
    ]);
  });
});
