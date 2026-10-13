import { describe, expect, it } from 'vitest';
import { formatMoney, formatSignedMoney } from './format';

describe('formatMoney', () => {
  it('usa punto de miles, espacio después del signo y sin decimales si no hay', () => {
    expect(formatMoney(42300)).toBe('$ 42.300');
    expect(formatMoney(0)).toBe('$ 0');
    expect(formatMoney(999999999)).toBe('$ 999.999.999');
  });

  it('muestra decimales sólo cuando existen', () => {
    expect(formatMoney(1249.9)).toBe('$ 1.249,90');
    expect(formatMoney(1249.0)).toBe('$ 1.249');
  });

  it('siempre devuelve el valor absoluto', () => {
    expect(formatMoney(-4200)).toBe('$ 4.200');
  });
});

describe('formatSignedMoney', () => {
  it('antepone + o − (signo menos tipográfico)', () => {
    expect(formatSignedMoney(4200)).toBe('+ $ 4.200');
    expect(formatSignedMoney(-4200)).toBe('− $ 4.200');
    expect(formatSignedMoney(0)).toBe('$ 0');
  });
});
