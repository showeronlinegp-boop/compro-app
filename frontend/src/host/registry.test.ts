import { afterEach, describe, expect, it, vi } from 'vitest';

async function idsDelRegistry() {
  vi.resetModules();
  const { registry } = await import('./registry');
  return registry.map((m) => m.id);
}

describe('registry', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('en dev y tests monta compras y Fiado', async () => {
    expect(await idsDelRegistry()).toEqual(['comparador', 'fiado']);
  });

  it('en un build de producción sale sólo Fiado', async () => {
    vi.stubEnv('DEV', false);
    expect(await idsDelRegistry()).toEqual(['fiado']);
  });

  it('VITE_ENABLE_COMPARADOR=true lo fuerza en producción', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_ENABLE_COMPARADOR', 'true');
    expect(await idsDelRegistry()).toEqual(['comparador', 'fiado']);
  });
});
