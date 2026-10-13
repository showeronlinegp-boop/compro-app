import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders icon, title, and description', () => {
    render(
      <EmptyState
        icon="🛒"
        title="Tu carrito está vacío"
        description="Agregá productos desde Explorar"
      />,
    );

    expect(screen.getByText('🛒')).toBeDefined();
    expect(screen.getByText('Tu carrito está vacío')).toBeDefined();
    expect(screen.getByText('Agregá productos desde Explorar')).toBeDefined();
  });

  it('does not render an action slot when action prop is omitted', () => {
    render(
      <EmptyState
        icon="🔍"
        title="Sin resultados"
        description="No hay nada por aquí"
      />,
    );

    // No button or link should be present
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders the action slot when provided', () => {
    render(
      <MemoryRouter>
        <EmptyState
          icon="♡"
          title="No tenés intereses guardados"
          description="Buscá productos en Explorar"
          action={<a href="/explore">Ir a Explorar</a>}
        />
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: 'Ir a Explorar' });
    expect(link).toBeDefined();
  });
});
