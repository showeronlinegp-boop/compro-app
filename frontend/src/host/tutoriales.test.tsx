import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminTutoriales } from './admin/AdminTutoriales';
import { linkDeVideo } from './tutoriales';

const api = vi.hoisted(() => ({ listar: vi.fn(), crear: vi.fn(), borrar: vi.fn() }));
vi.mock('./tutoriales', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./tutoriales')>()),
  tutorialesApi: api,
}));

const VIDEO = { id: 1, titulo: 'Cómo anotar un fiado', video_id: 'dQw4w9WgXcQ' };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('linkDeVideo', () => {
  it('linkDeVideo arma siempre un link a youtube.com', () => {
    expect(linkDeVideo('a/b?c')).toBe('https://www.youtube.com/watch?v=a%2Fb%3Fc');
  });
});

describe('Panel → Tutoriales', () => {
  it('agrega con título y link, y muestra el motivo si el link no sirve', async () => {
    api.listar.mockResolvedValue([]);
    render(<AdminTutoriales />);
    expect(await screen.findByText('Todavía no cargaste tutoriales.')).toBeDefined();
    const agregar = screen.getByRole('button', { name: 'Agregar tutorial' }) as HTMLButtonElement;
    expect(agregar.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: ' Cómo anotar ' } });
    fireEvent.change(screen.getByLabelText('Link de YouTube'), {
      target: { value: 'https://example.com' },
    });
    api.crear.mockRejectedValueOnce(
      new Error('400 {"message":"El link tiene que ser de un video de YouTube."}'),
    );
    await act(async () => {
      fireEvent.click(agregar);
    });
    expect(screen.getByText('El link tiene que ser de un video de YouTube.')).toBeDefined();

    api.crear.mockResolvedValueOnce(VIDEO);
    fireEvent.change(screen.getByLabelText('Link de YouTube'), {
      target: { value: 'https://youtu.be/dQw4w9WgXcQ' },
    });
    await act(async () => {
      fireEvent.click(agregar);
    });
    expect(api.crear).toHaveBeenLastCalledWith('Cómo anotar', 'https://youtu.be/dQw4w9WgXcQ');
    const lista = screen.getByRole('list', { name: 'Tutoriales cargados' });
    expect(within(lista).getByText('Cómo anotar un fiado')).toBeDefined();
    expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe('');
  });

  it('borra con confirmación', async () => {
    api.listar.mockResolvedValue([VIDEO]);
    api.borrar.mockResolvedValue(null);
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<AdminTutoriales />);
    const borrar = await screen.findByRole('button', { name: 'Borrar' });

    fireEvent.click(borrar);
    expect(api.borrar).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(borrar);
    });
    expect(confirmar).toHaveBeenCalledTimes(2);
    expect(api.borrar).toHaveBeenCalledWith(1);
    await waitFor(() =>
      expect(screen.getByText('Todavía no cargaste tutoriales.')).toBeDefined(),
    );
  });
});
