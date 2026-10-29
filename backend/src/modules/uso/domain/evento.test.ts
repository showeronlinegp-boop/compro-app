import { describe, expect, it } from 'vitest';
import { LOTE_MAX, LoteInvalido, parseLote } from './evento.js';

const pantalla = { evento: 'pantalla', modulo: 'fiado', ruta_id: 'ficha' };

describe('parseLote', () => {
  it('acepta pantallas y acciones; standalone/movil sólo con true', () => {
    expect(
      parseLote({
        eventos: [pantalla, { evento: 'comprobante', modulo: 'fiado' }],
        standalone: true,
        movil: 'si',
      }),
    ).toEqual({
      eventos: [
        { evento: 'pantalla', modulo: 'fiado', ruta_id: 'ficha' },
        { evento: 'comprobante', modulo: 'fiado', ruta_id: null },
      ],
      standalone: true,
      movil: false,
    });
  });

  it.each([
    ['sin body', undefined],
    ['sin eventos', {}],
    ['lote vacío', { eventos: [] }],
    ['evento desconocido', { eventos: [{ ...pantalla, evento: 'click' }] }],
    ['pantalla sin ruta', { eventos: [{ evento: 'pantalla', modulo: 'fiado' }] }],
    ['un path en vez de un id', { eventos: [{ ...pantalla, ruta_id: '/fiado/clientes/12' }] }],
    ['módulo con mayúsculas', { eventos: [{ ...pantalla, modulo: 'Fiado' }] }],
    ['módulo larguísimo', { eventos: [{ ...pantalla, modulo: 'a'.repeat(41) }] }],
    ['más del máximo', { eventos: Array(LOTE_MAX + 1).fill(pantalla) }],
  ])('rechaza: %s', (_caso, body) => {
    expect(() => parseLote(body)).toThrow(LoteInvalido);
  });
});
