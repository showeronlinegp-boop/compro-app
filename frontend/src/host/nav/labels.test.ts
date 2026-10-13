import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import type { NavItem } from '../contract';
import { topLabel } from './labels';

const base: NavItem = { id: 'x', to: '/x', label: 'Intereses' };

describe('topLabel', () => {
  it('sin badge devuelve el label tal cual', () => {
    expect(topLabel({ ...base, label: 'Explorar' })).toBe('Explorar');
  });

  it('badge 0 deja el espacio final, igual que el template histórico', () => {
    expect(topLabel({ ...base, badge: 0 })).toBe('Intereses ');
  });

  it('badge > 0 agrega el contador entre paréntesis', () => {
    expect(topLabel({ ...base, badge: 3 })).toBe('Intereses (3)');
  });

  it('iconInTop con emoji lo antepone', () => {
    expect(topLabel({ ...base, label: 'Comparar', icon: '📊', iconInTop: true })).toBe(
      '📊 Comparar',
    );
  });

  it('emoji sin iconInTop no se muestra en top', () => {
    expect(topLabel({ ...base, label: 'Explorar', icon: '🔍' })).toBe('Explorar');
  });

  it('un ícono no-string no se concatena (lo renderiza TopNav aparte)', () => {
    const icon = createElement('svg', { 'data-testid': 'svg' });
    expect(topLabel({ ...base, label: 'Comparar', icon, iconInTop: true })).toBe('Comparar');
  });
});
