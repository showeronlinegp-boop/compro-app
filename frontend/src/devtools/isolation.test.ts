import { describe, expect, it } from 'vitest';

/**
 * T9 — `devtools/` no conoce los módulos de dominio, y fuera de `devtools/`
 * sólo `host/tools.tsx` puede importarlo (el único punto de entrada, detrás
 * del gate de build).
 */

const sources = import.meta.glob<string>('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const IMPORT_RE = /(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g;

function importsOf(source: string): string[] {
  return Array.from(source.matchAll(IMPORT_RE), (m) => m[1] ?? '');
}

/** Devuelve `archivo → import` por cada import que rompe las reglas. */
function findViolations(files: Record<string, string>): string[] {
  const out: string[] = [];
  for (const [file, source] of Object.entries(files)) {
    if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue;
    const inDevtools = file.startsWith('/src/devtools/');
    for (const spec of importsOf(source)) {
      if (inDevtools && /(^|\/)modules\//.test(spec)) out.push(`${file} → ${spec}`);
      if (!inDevtools && file !== '/src/host/tools.tsx' && /(^|\/)devtools(\/|$)/.test(spec)) {
        out.push(`${file} → ${spec}`);
      }
    }
  }
  return out.sort();
}

describe('aislamiento de devtools', () => {
  it('escanea devtools y el host', () => {
    expect(Object.keys(sources)).toContain('/src/devtools/test-notes/TestNotes.tsx');
    expect(Object.keys(sources)).toContain('/src/host/tools.tsx');
  });

  it('devtools no importa módulos y sólo host/tools.tsx importa devtools', () => {
    expect(findViolations(sources)).toEqual([]);
  });

  it('detecta un import prohibido nombrando el archivo', () => {
    expect(
      findViolations({
        '/src/modules/fiado/pages/Inicio.tsx': "import x from '../../../devtools/test-notes';",
        '/src/devtools/test-notes/a.ts': "import { fiado } from '../../modules/fiado';",
        '/src/host/tools.tsx': "const C = lazy(() => import('../devtools/test-notes'));",
      }),
    ).toEqual([
      "/src/devtools/test-notes/a.ts → ../../modules/fiado",
      "/src/modules/fiado/pages/Inicio.tsx → ../../../devtools/test-notes",
    ]);
  });
});
