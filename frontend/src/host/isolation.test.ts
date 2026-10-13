import { describe, expect, it } from 'vitest';

/**
 * H5 — Aislamiento host → dominio.
 *
 * Ningún archivo bajo `src/host/` puede importar de `src/modules/**`, salvo
 * `registry.ts` (la única lista de módulos). Biome 1.9 no matchea paths
 * relativos y CI no corre lint, así que la regla vive en este test.
 */

const SPECIFIER_RE = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;
const ALLOWED = new Set(['registry.ts']);

/** Normaliza un path POSIX (resuelve `.` y `..`). Sin `node:path`: el front no tiene @types/node. */
function normalize(p: string): string {
  const out: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return out.join('/');
}

function dirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
}

/**
 * Recibe `{ './ruta/relativa/a/host.ts': contenido }` y devuelve los archivos
 * (sin `./`) que importan algo que cae en `src/modules/`.
 */
function findViolations(files: Record<string, string>): string[] {
  const violations: string[] = [];
  for (const [key, source] of Object.entries(files)) {
    const file = key.replace(/^\.\//, '');
    if (ALLOWED.has(file)) continue;
    const fromDir = `src/host/${dirname(file)}`;
    for (const match of source.matchAll(SPECIFIER_RE)) {
      const spec = match[1] ?? '';
      const hit = spec.startsWith('.')
        ? normalize(`${fromDir}/${spec}`).startsWith('src/modules/')
        : spec.includes('modules/');
      if (hit) {
        violations.push(file);
        break;
      }
    }
  }
  return violations.sort();
}

// Contenido crudo de todo el árbol de host/. Este archivo se excluye porque
// su caso sintético contiene, a propósito, un import prohibido como texto.
const hostTree = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('./**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }),
  ).filter(([key]) => key !== './isolation.test.ts'),
);

describe('H5: aislamiento host → dominio', () => {
  it('escanea el árbol real de host/', () => {
    expect(Object.keys(hostTree)).toContain('./HostApp.tsx');
    expect(Object.keys(hostTree)).toContain('./nav/BottomNav.tsx');
  });

  it('ningún archivo de host/ (salvo registry.ts) importa de modules/', () => {
    expect(findViolations(hostTree)).toEqual([]);
  });

  it('detecta una violación y nombra el archivo', () => {
    expect(
      findViolations({ './x.ts': "import { api } from '../modules/comparador/api';" }),
    ).toEqual(['x.ts']);
  });

  it('detecta import dinámico y side-effect, desde subcarpetas', () => {
    expect(
      findViolations({
        './nav/a.ts': "const m = import('../../modules/comparador/api');",
        './b.ts': "import '../modules/comparador/side-effect';",
        './ui/ok.ts': "import { FOCUS_RING } from './styles';",
      }),
    ).toEqual(['b.ts', 'nav/a.ts']);
  });

  it('registry.ts puede importar módulos', () => {
    expect(
      findViolations({ './registry.ts': "import { comparador } from '../modules/comparador';" }),
    ).toEqual([]);
  });
});
