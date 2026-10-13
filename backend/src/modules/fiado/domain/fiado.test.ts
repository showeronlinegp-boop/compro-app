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
  telefonoWhatsApp,
} from './fiado.js';

let seq = 0;
function mov(
  tipo: MovimientoLedger['tipo'],
  monto: number,
  fecha: string,
  corrige_id: number | null = null,
): MovimientoLedger {
  seq += 1;
  // 15:00 UTC = 12:00 en Argentina: la fecha calendario no cambia.
  return {
    id: seq,
    cliente_id: 1,
    tipo,
    monto,
    corrige_id,
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

  const base = {
    saldo: 1000,
    diasSinPagar: 5,
    proximoCobro: null,
    umbralDias: 30,
    hoy: '2026-10-13',
  };

  it('entra por fecha de cobro vencida o de hoy', () => {
    expect(paraCobrarHoy({ ...base, proximoCobro: '2026-10-13' })).toBe(true);
    expect(paraCobrarHoy({ ...base, proximoCobro: '2026-10-14' })).toBe(false);
  });

  it('entra por deuda vieja (días >= umbral)', () => {
    expect(paraCobrarHoy({ ...base, diasSinPagar: 30 })).toBe(true);
    expect(paraCobrarHoy({ ...base, diasSinPagar: 29 })).toBe(false);
  });

  it('sin deuda nunca entra', () => {
    expect(paraCobrarHoy({ ...base, saldo: 0, proximoCobro: '2026-10-01' })).toBe(false);
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
    });
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
