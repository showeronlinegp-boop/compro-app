import { describe, expect, it } from 'vitest';
import {
  FiadoError,
  type MovimientoLedger,
  coincideNombre,
  diasEntre,
  diasSinPagar,
  excedeLimite,
  fechaAR,
  formatSaldo,
  imputarFiados,
  montoConSigno,
  montoCorreccion,
  ordenarClientes,
  paraCobrarHoy,
  parseAjustesInput,
  parseClienteInput,
  parseClientePatch,
  parseMovimientoInput,
  parseOrden,
  primerNombre,
  renderPlantilla,
  saldo,
  sumarDias,
  telefonoWhatsApp,
  vencimientos,
} from './fiado.js';

let seq = 0;
function mov(
  tipo: MovimientoLedger['tipo'],
  monto: number,
  fecha: string,
  corrige_id: number | null = null,
  vence: string | null = null,
): MovimientoLedger {
  seq += 1;
  // 15:00 UTC = 12:00 en Argentina: la fecha calendario no cambia.
  return {
    id: seq,
    cliente_id: 1,
    tipo,
    monto,
    corrige_id,
    vence,
    created_at: new Date(`${fecha}T15:00:00Z`),
  };
}

describe('fechas', () => {
  it('fechaAR usa la hora argentina (UTC−3)', () => {
    expect(fechaAR(new Date('2026-10-14T02:00:00Z'))).toBe('2026-10-13');
    expect(fechaAR(new Date('2026-10-14T03:00:00Z'))).toBe('2026-10-14');
  });

  it('diasEntre cuenta días calendario', () => {
    expect(diasEntre('2026-09-25', '2026-10-13')).toBe(18);
    expect(diasEntre('2026-10-13', '2026-10-13')).toBe(0);
  });
});

describe('saldo y días sin pagar', () => {
  it('saldo = suma de montos con signo', () => {
    expect(saldo([mov('fiado', 5000, '2026-10-01'), mov('pago', -2000, '2026-10-05')])).toBe(3000);
  });

  it('cuenta desde el último pago', () => {
    const movs = [
      mov('fiado', 5000, '2026-09-01'),
      mov('pago', -1000, '2026-09-20'),
      mov('pago', -1000, '2026-10-03'),
      mov('fiado', 500, '2026-10-10'),
    ];
    expect(diasSinPagar(movs, '2026-10-13')).toBe(10);
  });

  it('si nunca pagó, cuenta desde el primer fiado', () => {
    const movs = [mov('fiado', 5000, '2026-09-25'), mov('fiado', 500, '2026-10-10')];
    expect(diasSinPagar(movs, '2026-10-13')).toBe(18);
  });

  it('sin deuda (saldo 0 o a favor) devuelve null', () => {
    expect(
      diasSinPagar(
        [mov('fiado', 100, '2026-10-01'), mov('pago', -100, '2026-10-02')],
        '2026-10-13',
      ),
    ).toBeNull();
    expect(diasSinPagar([mov('pago', -100, '2026-10-02')], '2026-10-13')).toBeNull();
  });

  it('un pago corregido no cuenta como último pago', () => {
    const fiado = mov('fiado', 5000, '2026-09-25');
    const pago = mov('pago', -1000, '2026-10-12');
    const correccion = mov('correccion', 1000, '2026-10-12', pago.id);
    expect(diasSinPagar([fiado, pago, correccion], '2026-10-13')).toBe(18);
  });
});

describe('correcciones', () => {
  it('la corrección es el opuesto exacto y deja el saldo como antes', () => {
    const f = mov('fiado', 4200, '2026-10-13');
    const c = mov('correccion', montoCorreccion(f, false), '2026-10-13', f.id);
    expect(c.monto).toBe(-4200);
    expect(saldo([f, c])).toBe(0);
  });

  it('no se corrige dos veces ni se corrige una corrección (409)', () => {
    expect(() => montoCorreccion({ tipo: 'fiado', monto: 100 }, true)).toThrow(FiadoError);
    try {
      montoCorreccion({ tipo: 'correccion', monto: -100 }, false);
    } catch (e) {
      expect((e as FiadoError).status).toBe(409);
    }
  });

  it('montoConSigno: fiado suma, pago resta', () => {
    expect(montoConSigno('fiado', 300)).toBe(300);
    expect(montoConSigno('pago', 300)).toBe(-300);
  });
});

describe('límite y para cobrar hoy', () => {
  it('excede sólo si hay límite y el saldo lo supera', () => {
    expect(excedeLimite(50_001, 50_000)).toBe(true);
    expect(excedeLimite(50_000, 50_000)).toBe(false);
    expect(excedeLimite(1_000_000, null)).toBe(false);
  });

  it('entra a "para cobrar hoy" sólo con algo vencido', () => {
    expect(paraCobrarHoy({ vencido: 1 })).toBe(true);
    expect(paraCobrarHoy({ vencido: 0 })).toBe(false);
  });
});

describe('vencimientos', () => {
  it('sumarDias cruza meses', () => {
    expect(sumarDias('2026-10-25', 7)).toBe('2026-11-01');
  });

  it('un fiado sin fecha vence a los umbralDias de anotado', () => {
    expect(imputarFiados([mov('fiado', 500, '2026-10-01')], 30)).toEqual([
      { id: seq, vence: '2026-10-31', pendiente: 500 },
    ]);
  });

  it('el pago tapa primero lo que vence antes, aunque se haya anotado después', () => {
    const tarde = mov('fiado', 1000, '2026-10-01', null, '2026-10-30');
    const pronto = mov('fiado', 800, '2026-10-05', null, '2026-10-12');
    const pago = mov('pago', -1200, '2026-10-12');
    expect(imputarFiados([tarde, pronto, pago], 30)).toEqual([
      { id: pronto.id, vence: '2026-10-12', pendiente: 0 },
      { id: tarde.id, vence: '2026-10-30', pendiente: 600 },
    ]);
  });

  it('los corregidos no cuentan: ni el fiado ni el pago deshechos', () => {
    const f = mov('fiado', 1000, '2026-10-01', null, '2026-10-10');
    const p = mov('pago', -1000, '2026-10-02');
    const corr = mov('correccion', 1000, '2026-10-02', p.id);
    const f2 = mov('fiado', 300, '2026-10-03', null, '2026-10-20');
    const corr2 = mov('correccion', -300, '2026-10-03', f2.id);
    expect(imputarFiados([f, p, corr, f2, corr2], 30)).toEqual([
      { id: f.id, vence: '2026-10-10', pendiente: 1000 },
    ]);
  });

  it('saldo a favor cubre lo que se anota después', () => {
    const p = mov('pago', -500, '2026-10-01');
    const f = mov('fiado', 800, '2026-10-02', null, '2026-10-09');
    expect(imputarFiados([p, f], 30)).toEqual([{ id: f.id, vence: '2026-10-09', pendiente: 300 }]);
  });

  it('vencido (hoy incluido) y próximo vencimiento', () => {
    const v = vencimientos(
      [
        { id: 1, vence: '2026-10-10', pendiente: 200 },
        { id: 2, vence: '2026-10-13', pendiente: 300 },
        { id: 3, vence: '2026-10-15', pendiente: 0 },
        { id: 4, vence: '2026-10-20', pendiente: 400 },
        { id: 5, vence: '2026-10-20', pendiente: 100 },
        { id: 6, vence: '2026-11-01', pendiente: 900 },
      ],
      '2026-10-13',
    );
    expect(v).toEqual({
      vencido: 500,
      vencido_desde: '2026-10-10',
      proximo: { fecha: '2026-10-20', monto: 500 },
    });
    expect(vencimientos([], '2026-10-13')).toEqual({
      vencido: 0,
      vencido_desde: null,
      proximo: null,
    });
  });
});

describe('mensajes', () => {
  it('primerNombre y formatSaldo', () => {
    expect(primerNombre('  Marta  Giménez ')).toBe('Marta');
    expect(formatSaldo(42300)).toBe('$ 42.300');
    expect(formatSaldo(-500)).toBe('$ 500 a favor');
  });

  it('renderPlantilla reemplaza variables y siempre firma', () => {
    expect(
      renderPlantilla('Hola {nombre}, saldo {saldo}. {otra}', { nombre: 'Marta', saldo: '$ 1' }),
    ).toBe('Hola Marta, saldo $ 1. {otra}\n\nHecho con Neggo');
    expect(renderPlantilla('Hola\n\nHecho con Neggo', {})).toBe('Hola\n\nHecho con Neggo');
  });
});

describe('telefonoWhatsApp', () => {
  it.each([
    ['11 1234-5678', '5491112345678'],
    ['011 15 1234-5678', '5491112345678'],
    ['+54 9 11 1234 5678', '5491112345678'],
    ['+54 11 1234 5678', '5491112345678'],
    ['0351 15 555-1234', '5493515551234'],
    ['(0294) 15-412-3456', '5492944123456'],
  ])('%s → %s', (raw, esperado) => {
    expect(telefonoWhatsApp(raw)).toBe(esperado);
  });

  it('devuelve null si no se puede interpretar', () => {
    expect(telefonoWhatsApp('1234')).toBeNull();
    expect(telefonoWhatsApp('')).toBeNull();
    expect(telefonoWhatsApp(null)).toBeNull();
  });
});

describe('validación de entrada', () => {
  it('cliente: nombre obligatorio, recorta y acepta opcionales vacíos', () => {
    expect(parseClienteInput({ nombre: ' Marta ', telefono: '', limite: '' })).toEqual({
      nombre: 'Marta',
      telefono: null,
      etiqueta: null,
      limite: null,
      proximo_cobro: null,
    });
    expect(() => parseClienteInput({ nombre: '  ' })).toThrow('nombre es obligatorio');
    expect(() => parseClienteInput({ nombre: 'A', proximo_cobro: '13/10/2026' })).toThrow(
      'AAAA-MM-DD',
    );
    expect(() => parseClienteInput({ nombre: 'A', limite: -1 })).toThrow('limite inválido');
  });

  it('patch: sólo los campos presentes; null borra', () => {
    expect(parseClientePatch({ limite: null })).toEqual({ limite: null });
    expect(parseClientePatch({})).toEqual({});
  });

  it('movimiento: tipo y monto entero de 1 a 9 dígitos', () => {
    expect(parseMovimientoInput({ cliente_id: 3, tipo: 'pago', monto: 4200 })).toMatchObject({
      cliente_id: 3,
      tipo: 'pago',
      monto: 4200,
      nota: null,
      vence: null,
    });
    expect(
      parseMovimientoInput({ cliente_id: 3, tipo: 'fiado', monto: 1, vence: '2026-11-10' }),
    ).toMatchObject({ vence: '2026-11-10' });
    expect(() =>
      parseMovimientoInput({ cliente_id: 3, tipo: 'pago', monto: 1, vence: '2026-11-10' }),
    ).toThrow('fecha de cobro');
    expect(() =>
      parseMovimientoInput({ cliente_id: 3, tipo: 'fiado', monto: 1, vence: '10/11' }),
    ).toThrow('vence');
    expect(() => parseMovimientoInput({ cliente_id: 3, tipo: 'correccion', monto: 1 })).toThrow(
      'tipo',
    );
    expect(() => parseMovimientoInput({ cliente_id: 3, tipo: 'fiado', monto: 0 })).toThrow('monto');
    expect(() =>
      parseMovimientoInput({ cliente_id: 3, tipo: 'fiado', monto: 1_000_000_000 }),
    ).toThrow('monto');
    expect(() => parseMovimientoInput({ cliente_id: 3, tipo: 'fiado', monto: 1.5 })).toThrow(
      'monto',
    );
  });

  it('orden y ajustes', () => {
    expect(parseOrden(undefined)).toBe('deuda');
    expect(() => parseOrden('x')).toThrow(FiadoError);
    expect(parseAjustesInput({ plantilla_pago: '', dias_deuda_vieja: '45' })).toEqual({
      plantilla_pago: null,
      dias_deuda_vieja: 45,
    });
    expect(() => parseAjustesInput({ dias_deuda_vieja: 0 })).toThrow('dias_deuda_vieja');
  });
});

describe('lista de clientes', () => {
  const c = (nombre: string, s: number, d: number | null) => ({
    nombre,
    saldo: s,
    dias_sin_pagar: d,
  });
  const lista = [c('Beto', 100, 40), c('Ana', 900, 2), c('Carla', 900, null)];

  it('ordena por deuda, días o nombre', () => {
    expect(ordenarClientes(lista, 'deuda').map((x) => x.nombre)).toEqual(['Ana', 'Carla', 'Beto']);
    expect(ordenarClientes(lista, 'dias').map((x) => x.nombre)).toEqual(['Beto', 'Ana', 'Carla']);
    expect(ordenarClientes(lista, 'az').map((x) => x.nombre)).toEqual(['Ana', 'Beto', 'Carla']);
  });

  it('busca sin tildes ni mayúsculas', () => {
    expect(coincideNombre('Marta Giménez', 'gimen')).toBe(true);
    expect(coincideNombre('José', 'jose')).toBe(true);
    expect(coincideNombre('Ana', 'beto')).toBe(false);
  });
});
