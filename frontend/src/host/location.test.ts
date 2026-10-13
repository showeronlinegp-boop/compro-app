import { describe, expect, it } from 'vitest';
import type { AppModule, ModuleRoute } from './contract';
import { chromeOf, resolveLocation } from './location';

const Dummy = () => null;
const route = (id: string, path: string, extra: Partial<ModuleRoute> = {}): ModuleRoute => ({
  id,
  path,
  component: Dummy,
  auth: 'public',
  title: id,
  ...extra,
});

const root: AppModule = {
  id: 'root',
  label: 'Root',
  basePath: '/',
  routes: [route('home', ''), route('cart', 'cart')],
};
const demo: AppModule = {
  id: 'demo',
  label: 'Demo',
  basePath: '/demo',
  routes: [
    route('lista', ''),
    route('detalle', ':id'),
    route('anotar', 'anotar', { chrome: 'task' }),
  ],
};
const modules = [root, demo];

describe('resolveLocation', () => {
  it('devuelve módulo, ruta y fullPath sin navItem', () => {
    const loc = resolveLocation('/cart', modules);
    expect(loc?.module.id).toBe('root');
    expect(loc?.route.id).toBe('cart');
    expect(loc?.fullPath).toBe('/cart');
    expect(loc && 'navItem' in loc).toBe(false);
  });

  it('el patrón más específico gana: /demo/7 → /demo/:id con params', () => {
    const loc = resolveLocation('/demo/7', modules);
    expect(loc?.route.id).toBe('detalle');
    expect(loc?.fullPath).toBe('/demo/:id');
    expect(loc?.params.id).toBe('7');
  });

  it('una ruta estática le gana a la dinámica: /demo/anotar', () => {
    expect(resolveLocation('/demo/anotar', modules)?.route.id).toBe('anotar');
  });

  it('el índice matchea /demo', () => {
    expect(resolveLocation('/demo', modules)?.route.id).toBe('lista');
  });

  it.each(['/sign-in/factor-one', '/no-existe'])('%s → null', (path) => {
    expect(resolveLocation(path, modules)).toBeNull();
  });
});

describe('chromeOf', () => {
  it('null → full', () => {
    expect(chromeOf(null)).toBe('full');
  });

  it('ruta sin campo chrome → full', () => {
    expect(chromeOf(resolveLocation('/demo', modules))).toBe('full');
  });

  it("ruta con chrome 'task' → task", () => {
    expect(chromeOf(resolveLocation('/demo/anotar', modules))).toBe('task');
  });
});
