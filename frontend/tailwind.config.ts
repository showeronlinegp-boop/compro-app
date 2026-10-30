import type { Config } from 'tailwindcss';

// ─── Sistema de diseño Neggo (docs/design-system.md) ─────────────────────────
//
// MOBILE ONLY — `screens` vacío: no existen `sm:`/`md:`/`lg:`. La app vive en
// una columna de máx. 480 px (HostLayout), así que un breakpoint por ancho de
// viewport no describe el espacio real. Las clases con breakpoint que todavía
// queden en el comparador no generan CSS y rige siempre su versión mobile.
//
// Colores, fuentes, tamaños y radios salen de los tokens CSS de `index.css`.
// Código nuevo usa SOLO estos nombres (ver host/ui/design-lint.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    screens: {},
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: { DEFAULT: 'var(--surface)', muted: 'var(--surface-muted)' },
        ink: {
          DEFAULT: 'var(--ink)',
          muted: 'var(--ink-muted)',
          disabled: 'var(--ink-disabled)',
        },
        line: 'var(--line)',
        border: { DEFAULT: 'var(--border)', strong: 'var(--border-strong)' },
        avatar: 'var(--avatar)',
        disabled: 'var(--disabled)',
        'on-dark': { muted: 'var(--on-dark-muted)', body: 'var(--on-dark-body)' },
        focus: 'var(--focus)',
        scrim: 'var(--scrim)',
        ok: { DEFAULT: 'var(--ok)', bg: 'var(--ok-bg)' },
        warn: { DEFAULT: 'var(--warn)', strong: 'var(--warn-strong)', bg: 'var(--warn-bg)' },
        late: { DEFAULT: 'var(--late)', bg: 'var(--late-bg)' },
        danger: 'var(--danger)',
        fiado: 'var(--fiado)',
        pago: { DEFAULT: 'var(--pago)', hover: 'var(--pago-hover)' },
        whatsapp: { DEFAULT: 'var(--whatsapp)', bubble: 'var(--whatsapp-bubble)' },
        // Series de gráficos, en este orden (validadas para daltonismo sobre --surface).
        chart: { 1: 'var(--chart-1)', 2: 'var(--chart-2)' },
        // Identidad de cada súper (comparador): punto, borde o etiqueta, nunca fondo de botón.
        vea: { DEFAULT: '#E30613', light: '#fef2f2' },
        carrefour: { DEFAULT: '#004B93', light: '#eff6ff' },
        dia: { DEFAULT: '#E20032', light: '#fff1f2' },
        masonline: { DEFAULT: '#FF6600', light: '#fff7ed' },
      },
      fontFamily: {
        display: 'var(--font-display)',
        body: 'var(--font-body)',
      },
      fontSize: {
        'amount-xl': ['42px', { lineHeight: '1.1', letterSpacing: '-0.5px', fontWeight: '800' }],
        'amount-l': ['44px', { lineHeight: '1.1', letterSpacing: '-0.5px', fontWeight: '800' }],
        'amount-m': ['38px', { lineHeight: '1.1', letterSpacing: '-0.5px', fontWeight: '800' }],
        price: ['20px', { lineHeight: '1.2', fontWeight: '800' }],
        'title-l': ['26px', { lineHeight: '1.2', fontWeight: '800' }],
        'title-m': ['22px', { lineHeight: '1.25', fontWeight: '800' }],
        'title-s': ['19px', { lineHeight: '1.3', fontWeight: '700' }],
        'button-l': ['18px', { lineHeight: '1.2', fontWeight: '700' }],
        'button-m': ['16px', { lineHeight: '1.2', fontWeight: '700' }],
        keypad: ['22px', { lineHeight: '1', fontWeight: '600' }],
        'body-l': ['17px', '1.45'],
        body: ['16px', '1.4'],
        'body-s': ['15px', '1.4'],
        caption: ['14px', '1.35'],
        micro: ['13px', '1.3'],
      },
      borderRadius: {
        m: '12px',
        l: '16px',
        xl: '20px',
        pill: '999px',
      },
      minHeight: { touch: '44px' },
      minWidth: { touch: '44px' },
      height: { nav: '74px' },
      maxWidth: { app: '480px' },
    },
  },
  plugins: [],
} satisfies Config;
