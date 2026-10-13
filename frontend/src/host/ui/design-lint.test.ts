import { describe, expect, it } from 'vitest';

/**
 * "Lint de diseño" (docs/design-system.md §7): el código del host y de los
 * módulos ya migrados usa SÓLO tokens. CI no corre Biome y Biome no sabe de
 * clases de Tailwind, así que la regla vive en este test.
 *
 * El comparador todavía no está migrado (guía §7.1) y queda fuera del escaneo.
 * Cuando un módulo nuevo se suma, se agrega su glob acá.
 */

interface Rule {
  name: string;
  re: RegExp;
}

const RULES: Rule[] = [
  {
    name: 'paleta default de Tailwind (gray/indigo/…)',
    re: /\b(?:bg|text|border|ring|from|to|via)-(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/,
  },
  { name: 'sombras', re: /\bshadow(?:-\w+)?\b/ },
  { name: 'degradados', re: /\bbg-gradient-/ },
  { name: 'texto menor a 12 px', re: /\btext-(?:xs|\[(?:[0-9]|1[01])px\])/ },
  { name: 'breakpoints (la app es mobile-only)', re: /(?:^|[\s"'`])(?:sm|md|lg|xl|2xl):[a-z[!-]/ },
  { name: 'emoji', re: /\p{Extended_Pictographic}/u },
  { name: 'hex suelto en clases', re: /\b(?:bg|text|border)-\[#/ },
];

/** Devuelve `archivo: regla` por cada violación encontrada. */
function findDesignViolations(files: Record<string, string>): string[] {
  const out: string[] = [];
  for (const [file, source] of Object.entries(files)) {
    for (const rule of RULES) {
      if (rule.re.test(source)) out.push(`${file}: ${rule.name}`);
    }
  }
  return out.sort();
}

// Archivos de producción (no tests) del host. El comparador queda fuera hasta su migración.
const scanned = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  ),
);

describe('lint de diseño', () => {
  it('escanea el host', () => {
    expect(Object.keys(scanned)).toContain('../HostLayout.tsx');
    expect(Object.keys(scanned)).toContain('./Button.tsx');
  });

  it('el host usa sólo tokens del sistema de diseño', () => {
    expect(findDesignViolations(scanned)).toEqual([]);
  });

  it('detecta cada regla', () => {
    expect(
      findDesignViolations({
        'a.tsx': 'className="bg-indigo-600 shadow-xl text-xs lg:flex"',
        'b.tsx': "const icon = '🛒';",
        'c.tsx': 'className="bg-surface text-ink rounded-xl"',
      }),
    ).toEqual([
      'a.tsx: breakpoints (la app es mobile-only)',
      'a.tsx: paleta default de Tailwind (gray/indigo/…)',
      'a.tsx: sombras',
      'a.tsx: texto menor a 12 px',
      'b.tsx: emoji',
    ]);
  });
});
