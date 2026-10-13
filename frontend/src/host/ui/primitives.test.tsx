import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { ScreenHeader } from './ScreenHeader';
import { FilterChips, TextField } from './controls';
import { Avatar, DataCells, List, ListRow, Pill } from './surfaces';

afterEach(() => {
  cleanup();
});

describe('Button', () => {
  it('es un <button type="button"> con la variante pedida', () => {
    render(<Button variant="fiado">Anotar fiado</Button>);
    const b = screen.getByRole('button', { name: 'Anotar fiado' });
    expect(b.getAttribute('type')).toBe('button');
    expect(b.className).toContain('bg-fiado');
  });

  it('deshabilitado usa --disabled sin importar la variante y no dispara onClick', () => {
    const onClick = vi.fn();
    render(
      <Button variant="pago" disabled onClick={onClick}>
        Confirmar
      </Button>,
    );
    const b = screen.getByRole('button', { name: 'Confirmar' });
    expect(b.className).toContain('bg-disabled');
    expect(b.className).not.toContain('bg-pago');
    fireEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('FilterChips', () => {
  function Harness() {
    const [v, setV] = useState<'deuda' | 'az'>('deuda');
    return (
      <FilterChips
        label="Ordenar por"
        value={v}
        onChange={setV}
        options={[
          { value: 'deuda', label: 'Más deuda' },
          { value: 'az', label: 'A a Z' },
        ]}
      />
    );
  }

  it('marca la opción elegida con aria-pressed y cambia al tocar otra', () => {
    render(<Harness />);
    expect(screen.getByRole('group', { name: 'Ordenar por' })).toBeDefined();
    const deuda = screen.getByRole('button', { name: 'Más deuda' });
    const az = screen.getByRole('button', { name: 'A a Z' });
    expect(deuda.getAttribute('aria-pressed')).toBe('true');
    expect(az.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(az);
    expect(az.getAttribute('aria-pressed')).toBe('true');
    expect(deuda.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('TextField', () => {
  it('asocia label visible e hint al input', () => {
    render(<TextField label="Teléfono" inputMode="tel" hint="Con código de área" />);
    const input = screen.getByLabelText('Teléfono');
    expect(input.getAttribute('inputmode')).toBe('tel');
    const hintId = input.getAttribute('aria-describedby');
    expect(hintId && document.getElementById(hintId)?.textContent).toBe('Con código de área');
    // 17 px: iOS no hace zoom.
    expect(input.className).toContain('text-body-l');
  });
});

describe('ListRow / Avatar / Pill / DataCells', () => {
  it('con onClick la fila entera es un botón', () => {
    const onClick = vi.fn();
    render(
      <List label="Clientes">
        <ListRow
          leading={<Avatar name="marta Giménez" />}
          title="Marta Giménez"
          subtitle="18 días sin pagar"
          trailing={<Pill tone="warn">Pasó el límite</Pill>}
          onClick={onClick}
        />
      </List>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Marta Giménez/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByText('M').getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('list', { name: 'Clientes' })).toBeDefined();
  });

  it('DataCells arma un <dl> con label y valor', () => {
    render(
      <DataCells
        cells={[
          { label: 'Límite', value: '$ 50.000' },
          { label: 'Sin pagar', value: '18 días' },
        ]}
      />,
    );
    expect(screen.getByText('Límite').tagName).toBe('DT');
    expect(screen.getByText('$ 50.000').tagName).toBe('DD');
  });
});

describe('ScreenHeader', () => {
  const routes = (
    <Routes>
      <Route path="/origen" element={<h1>Origen</h1>} />
      <Route path="/fallback" element={<h1>Fallback</h1>} />
      <Route
        path="/tarea"
        element={<ScreenHeader variant="task" title="Anotar fiado" backTo="/fallback" />}
      />
    </Routes>
  );

  it('task: volver usa el historial cuando hay pantalla de origen', () => {
    render(
      <MemoryRouter initialEntries={['/origen', '/tarea']} initialIndex={1}>
        {routes}
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Anotar fiado' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(screen.getByRole('heading', { name: 'Origen' })).toBeDefined();
  });

  it('task: entrada directa sin historial → va a backTo', () => {
    render(<MemoryRouter initialEntries={['/tarea']}>{routes}</MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(screen.getByRole('heading', { name: 'Fallback' })).toBeDefined();
  });

  it('place: título h1 y acción a la derecha', () => {
    render(
      <MemoryRouter>
        <ScreenHeader variant="place" title="Clientes" action={<Button size="s">+ Nuevo</Button>} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Clientes' })).toBeDefined();
    expect(screen.getByRole('button', { name: '+ Nuevo' })).toBeDefined();
  });
});
