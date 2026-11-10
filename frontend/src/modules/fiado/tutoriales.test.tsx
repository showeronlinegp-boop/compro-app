import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SeccionTutoriales } from './Tutoriales';

const api = vi.hoisted(() => ({ listar: vi.fn(), crear: vi.fn(), borrar: vi.fn() }));
vi.mock('../../host/tutoriales', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../host/tutoriales')>()),
  tutorialesApi: api,
}));

const VIDEO = { id: 1, titulo: 'Cómo anotar un fiado', video_id: 'dQw4w9WgXcQ' };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('Ajustes → Tutoriales', () => {
  it('cada tutorial es un link a su video de YouTube, en otra pestaña', async () => {
    api.listar.mockResolvedValue([VIDEO]);
    render(<SeccionTutoriales />);
    const lista = await screen.findByRole('list', { name: 'Tutoriales' });
    const link = within(lista).getByRole('link', { name: /Cómo anotar un fiado/ });
    expect(link.getAttribute('href')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('sin tutoriales (o si falla la carga) la sección no aparece', async () => {
    api.listar.mockResolvedValue([]);
    const { container } = render(<SeccionTutoriales />);
    await act(async () => {});
    expect(container.textContent).toBe('');

    cleanup();
    api.listar.mockRejectedValue(new Error('500 caído'));
    const otro = render(<SeccionTutoriales />);
    await act(async () => {});
    expect(otro.container.textContent).toBe('');
  });
});

