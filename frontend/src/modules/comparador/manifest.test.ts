import { describe, expect, it } from 'vitest';
import { resolveLocation } from '../../host/location';
import { flattenRoutes } from '../../host/routing';
import { comparador } from './index';

// C1 — el manifest es la única declaración del comparador; sus rutas tienen que
// coincidir en path y auth con la tabla de H1 (sign-in/sign-up son del host).
const H1: ReadonlyArray<[string, 'public' | 'required']> = [
  ['/', 'public'],
  ['/intereses', 'required'],
  ['/planner', 'required'],
  ['/cart', 'required'],
  ['/compare', 'required'],
  ['/onboarding', 'required'],
];

describe('manifest del comparador (C1)', () => {
  it('se monta en "/" con Provider, useNav y slots', () => {
    expect(comparador.id).toBe('comparador');
    expect(comparador.basePath).toBe('/');
    expect(comparador.Provider).toBeTypeOf('function');
    expect(comparador.useNav).toBeTypeOf('function');
    expect(comparador.slots?.headerActions).toBeTypeOf('function');
    expect(comparador.slots?.overlays).toBeTypeOf('function');
  });

  it('declara exactamente las rutas de H1, en orden y con su auth', () => {
    const flat = flattenRoutes([comparador]).map(({ fullPath, route }) => [fullPath, route.auth]);
    expect(flat).toEqual(H1);
  });

  it('ids de ruta únicos y ninguna ruta declara chrome (todas "full", H8)', () => {
    const ids = comparador.routes.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(comparador.routes.every((r) => r.chrome === undefined)).toBe(true);
  });
});

describe('resolveLocation con el comparador (H6)', () => {
  it("'/compare' → módulo comparador, ruta compare, sin navItem", () => {
    const loc = resolveLocation('/compare', [comparador]);
    expect(loc?.module).toBe(comparador);
    expect(loc?.route.id).toBe('compare');
    expect(loc?.fullPath).toBe('/compare');
    expect(loc).not.toHaveProperty('navItem');
  });

  it("'/' resuelve Explorar (índice)", () => {
    expect(resolveLocation('/', [comparador])?.route.id).toBe('explorar');
  });

  it.each(['/sign-in/factor-one', '/sign-up', '/no-existe'])('%s → null', (path) => {
    expect(resolveLocation(path, [comparador])).toBeNull();
  });
});
