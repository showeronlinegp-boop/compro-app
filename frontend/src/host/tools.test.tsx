import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HostToolsOutlet, hostTools } from './tools';

const Tool = () => <div data-testid="tool">tool</div>;

describe('HostToolsOutlet', () => {
  afterEach(() => {
    cleanup();
  });

  it('la lista del host está vacía en este cambio', () => {
    expect(hostTools).toEqual([]);
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
