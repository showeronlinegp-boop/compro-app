import { describe, expect, it } from 'vitest';
import { claudeLink } from './claude-link';

describe('claudeLink', () => {
  it('arma el link con solo el número de la nota', () => {
    expect(claudeLink(12)).toBe('compro-claude://nota/12');
  });

  it('rechaza ids que no son enteros positivos (el .ps1 también los rechaza)', () => {
    expect(() => claudeLink(0)).toThrow();
    expect(() => claudeLink(-3)).toThrow();
    expect(() => claudeLink(1.5)).toThrow();
    expect(() => claudeLink(Number.NaN)).toThrow();
  });
});
