import { lazy } from 'react';
import { describe, expect, it } from 'vitest';
import type { AppModule } from './contract';
import { flattenRoutes, isLazyComponent, joinPath } from './routing';

const Dummy = () => null;

describe('joinPath', () => {
  it.each([
    ['/', '', '/'],
    ['/', 'intereses', '/intereses'],
    ['/fiado', '', '/fiado'],
    ['/fiado', 'anotar', '/fiado/anotar'],
    ['/fiado/', '/anotar', '/fiado/anotar'],
  ])('joinPath(%j, %j) → %j', (base, path, expected) => {
    expect(joinPath(base, path)).toBe(expected);
  });
});

describe('flattenRoutes', () => {
  it('resuelve cada ruta relativa a su basePath, en orden de registry', () => {
    const a: AppModule = {
      id: 'a',
      label: 'A',
      basePath: '/',
      routes: [{ id: 'home', path: '', component: Dummy, auth: 'public', title: 'Home' }],
    };
    const b: AppModule = {
      id: 'b',
      label: 'B',
      basePath: '/b',
      routes: [{ id: 'x', path: 'x', component: Dummy, auth: 'required', title: 'X' }],
    };
    expect(flattenRoutes([a, b]).map((r) => r.fullPath)).toEqual(['/', '/b/x']);
  });
});

describe('isLazyComponent', () => {
  it('distingue lazy de eager', () => {
    expect(isLazyComponent(Dummy)).toBe(false);
    expect(isLazyComponent(lazy(async () => ({ default: Dummy })))).toBe(true);
  });
});
