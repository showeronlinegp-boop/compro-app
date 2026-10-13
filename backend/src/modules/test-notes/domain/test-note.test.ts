import { describe, expect, it } from 'vitest';
import {
  LIMITES,
  contextoSeguro,
  isViva,
  modosSeguros,
  parseCreate,
  parsePatch,
  recortar,
  resueltaAtFor,
} from './test-note.js';

function okValue<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(`se esperaba ok, vino error: ${r.error}`);
  return r.value;
}

describe('parseCreate (A2)', () => {
  it('Alta completa: recorta texto, respeta tipo y filtra/ordena modo', () => {
    const v = okValue(
      parseCreate({
        texto: ' Falla ',
        ruta: '/cart',
        tipo: 'duda',
        modo: ['consultas', 'debatir', 'x', 'debatir'],
      }),
    );
    expect(v.texto).toBe('Falla');
    expect(v.ruta).toBe('/cart');
    expect(v.tipo).toBe('duda');
    expect(v.modo).toEqual(['debatir', 'consultas']);
  });

  it('Texto vacío → error', () => {
    const r = parseCreate({ texto: '   ', ruta: '/' });
    expect(r).toEqual({ ok: false, error: 'Escribí qué pasó' });
  });

  it('ruta vacía → error', () => {
    const r = parseCreate({ texto: 'algo', ruta: '  ' });
    expect(r).toEqual({ ok: false, error: 'Falta la pantalla de la nota' });
  });

  it('cuerpo que no es objeto → error de texto', () => {
    expect(parseCreate(null).ok).toBe(false);
    expect(parseCreate('hola').ok).toBe(false);
    expect(parseCreate([1, 2]).ok).toBe(false);
  });

  it('tipo inválido cae en "error"', () => {
    expect(okValue(parseCreate({ texto: 'a', ruta: '/', tipo: 'rara' })).tipo).toBe('error');
    expect(okValue(parseCreate({ texto: 'a', ruta: '/' })).tipo).toBe('error');
  });

  it('recorta los opcionales a su largo máximo', () => {
    const v = okValue(
      parseCreate({
        texto: 'x'.repeat(6000),
        ruta: `/${'r'.repeat(600)}`,
        pantalla: 'p'.repeat(300),
        selector: 's'.repeat(3000),
        elemento: 'e'.repeat(400),
      }),
    );
    expect(v.texto).toHaveLength(LIMITES.texto);
    expect(v.ruta).toHaveLength(LIMITES.ruta);
    expect(v.pantalla).toHaveLength(LIMITES.pantalla);
    expect(v.selector).toHaveLength(LIMITES.selector);
    expect(v.elemento).toHaveLength(LIMITES.elemento);
  });

  it('opcionales ausentes o vacíos quedan null', () => {
    const v = okValue(parseCreate({ texto: 'a', ruta: '/', pantalla: '  ', selector: null }));
    expect(v.pantalla).toBeNull();
    expect(v.selector).toBeNull();
    expect(v.elemento).toBeNull();
    expect(v.contexto).toBeNull();
    expect(v.modo).toEqual([]);
  });

  it('coordenadas: numéricas se guardan, no numéricas quedan null', () => {
    const v = okValue(
      parseCreate({ texto: 'a', ruta: '/', pos_x: 0.25, pos_y: '120.7', viewport_w: 390 }),
    );
    expect(v.pos_x).toBe(0.25);
    expect(v.pos_y).toBe(120);
    expect(v.viewport_w).toBe(390);

    const w = okValue(
      parseCreate({ texto: 'a', ruta: '/', pos_x: 'abc', pos_y: null, viewport_w: '' }),
    );
    expect(w.pos_x).toBeNull();
    expect(w.pos_y).toBeNull();
    expect(w.viewport_w).toBeNull();
  });

  it('pos_y fuera de rango INTEGER queda null', () => {
    expect(okValue(parseCreate({ texto: 'a', ruta: '/', pos_y: 1e12 })).pos_y).toBeNull();
  });

  it('Contexto excedido → contexto null', () => {
    const grande = { errores: ['x'.repeat(LIMITES.contexto + 1)] };
    expect(okValue(parseCreate({ texto: 'a', ruta: '/', contexto: grande })).contexto).toBeNull();
  });

  it('contexto válido se conserva', () => {
    const ctx = { viewport: '390x844', errores: [], api: [{ metodo: 'GET', status: 500 }] };
    expect(okValue(parseCreate({ texto: 'a', ruta: '/', contexto: ctx })).contexto).toEqual(ctx);
  });
});

describe('contextoSeguro', () => {
  it('rechaza arrays, primitivos y null', () => {
    expect(contextoSeguro([1])).toBeNull();
    expect(contextoSeguro('x')).toBeNull();
    expect(contextoSeguro(null)).toBeNull();
  });

  it('acepta exactamente el límite', () => {
    // {"a":"…"} → 8 caracteres de envoltorio
    const justo = { a: 'x'.repeat(LIMITES.contexto - 8) };
    expect(JSON.stringify(justo)).toHaveLength(LIMITES.contexto);
    expect(contextoSeguro(justo)).toEqual(justo);
  });
});

describe('modosSeguros / recortar', () => {
  it('modo que no es array → []', () => {
    expect(modosSeguros('debatir')).toEqual([]);
  });

  it('recortar ignora objetos', () => {
    expect(recortar({ a: 1 }, 10)).toBeNull();
    expect(recortar(12, 10)).toBe('12');
  });
});

describe('parsePatch (A4)', () => {
  const now = new Date('2026-10-13T12:00:00.000Z');

  it('estado cerrado setea resuelta_at', () => {
    expect(okValue(parsePatch({ estado: 'corregida' }, now))).toEqual({
      estado: 'corregida',
      resuelta_at: now,
    });
    expect(okValue(parsePatch({ estado: 'descartada' }, now)).resuelta_at).toBe(now);
  });

  it('cualquier otro estado pone resuelta_at en null', () => {
    expect(okValue(parsePatch({ estado: 'abierta' }, now))).toEqual({
      estado: 'abierta',
      resuelta_at: null,
    });
  });

  it('acepta un subconjunto de campos', () => {
    expect(
      okValue(
        parsePatch({ tipo: 'mejora', texto: ' nuevo ', respuesta: ' ok ', modo: ['investigar'] }),
      ),
    ).toEqual({ tipo: 'mejora', texto: 'nuevo', respuesta: 'ok', modo: ['investigar'] });
  });

  it('respuesta vacía se guarda como null', () => {
    expect(okValue(parsePatch({ respuesta: '  ' }))).toEqual({ respuesta: null });
  });

  it('modo [] es un patch válido (vuelve a directo)', () => {
    expect(okValue(parsePatch({ modo: [] }))).toEqual({ modo: [] });
  });

  it('estado inválido → error', () => {
    expect(parsePatch({ estado: 'rara' })).toEqual({ ok: false, error: 'Estado inválido' });
  });

  it('tipo inválido → error', () => {
    expect(parsePatch({ tipo: 'rara' })).toEqual({ ok: false, error: 'Tipo inválido' });
  });

  it('texto vacío → error', () => {
    expect(parsePatch({ texto: '   ' })).toEqual({
      ok: false,
      error: 'La nota no puede quedar vacía',
    });
  });

  it('cuerpo vacío o sin campos conocidos → error', () => {
    expect(parsePatch({})).toEqual({ ok: false, error: 'Nada para actualizar' });
    expect(parsePatch({ user_id: 99, foo: 1 })).toEqual({
      ok: false,
      error: 'Nada para actualizar',
    });
    expect(parsePatch(null)).toEqual({ ok: false, error: 'Nada para actualizar' });
  });

  it('nunca acepta user_id (el autor no cambia)', () => {
    const v = okValue(parsePatch({ estado: 'en_curso', user_id: 99 }, now));
    expect(v).not.toHaveProperty('user_id');
  });
});

describe('resueltaAtFor / isViva', () => {
  it('solo corregida y descartada cierran', () => {
    const now = new Date();
    expect(resueltaAtFor('corregida', now)).toBe(now);
    expect(resueltaAtFor('descartada', now)).toBe(now);
    expect(resueltaAtFor('para_revisar', now)).toBeNull();
  });

  it('vivas = abierta, en_curso, consulta, para_revisar', () => {
    expect(isViva('abierta')).toBe(true);
    expect(isViva('consulta')).toBe(true);
    expect(isViva('para_revisar')).toBe(true);
    expect(isViva('corregida')).toBe(false);
    expect(isViva('descartada')).toBe(false);
  });
});
