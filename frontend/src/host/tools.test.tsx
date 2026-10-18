import { cleanup, render, screen } from '@testing-library/react';
import { lazy } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HostToolsOutlet, hostTools } from './tools';

const Tool = () => <div data-testid="tool">tool</div>;

describe('HostToolsOutlet', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it('flags apagadas: sin VITE_TEST_NOTES la lista del host está vacía', () => {
    expect(hostTools).toEqual([]);
  });

  it('con VITE_TEST_NOTES=1 en dev registra test-notes', async () => {
    vi.stubEnv('VITE_TEST_NOTES', '1');
    vi.resetModules();
    const { hostTools: tools } = await import('./tools');
    expect(tools.map((t) => t.id)).toEqual(['test-notes']);
  });

  it('en un build de producción no hay tools aunque la flag esté', async () => {
    vi.stubEnv('VITE_TEST_NOTES', '1');
    vi.stubEnv('DEV', false);
    vi.resetModules();
    const { hostTools: tools } = await import('./tools');
    expect(tools).toEqual([]);
  });

  it('una tool diferida se monta dentro de su Suspense', async () => {
    const Diferida = lazy(async () => ({ default: Tool }));
    render(<HostToolsOutlet tools={[{ id: 'd', enabled: true, Component: Diferida }]} />);
    expect(await screen.findByTestId('tool')).toBeDefined();
  });

  it('con la lista vacía no agrega markup', () => {
    const { container } = render(<HostToolsOutlet />);
    expect(container.innerHTML).toBe('');
  });

  it('una tool deshabilitada no se monta', () => {
    const { container } = render(
      <HostToolsOutlet tools={[{ id: 't', enabled: false, Component: Tool }]} />,
    );
    expect(screen.queryByTestId('tool')).toBeNull();
    expect(container.innerHTML).toBe('');
  });

  it('una tool habilitada se monta', () => {
    render(<HostToolsOutlet tools={[{ id: 't', enabled: true, Component: Tool }]} />);
    expect(screen.getByTestId('tool')).toBeDefined();
  });
});
