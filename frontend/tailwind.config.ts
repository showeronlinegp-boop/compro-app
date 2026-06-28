import type { Config } from 'tailwindcss';

// ─── Tailwind Spacing / Radius / Density Convention ───────────────────────────
//
// PAGE PADDING  — handled exclusively via PageContainer; never repeat ad-hoc.
//   Horizontal: px-4 (mobile) | sm:px-6 (≥640 px) | lg:px-8 (≥1024 px)
//   Vertical:   py-6 on data pages
//
// SECTION GAP   — between major cards: space-y-6
//                 within dense rows:   gap-3
//                 chip / badge groups: gap-2
//
// RADIUS RHYTHM — cards & containers:        rounded-2xl
//                 interactive controls/pills: rounded-xl
//                 small inline badges:        rounded-full
//                 data-dense table cells:     none (no radius)
//
// DENSITY       — table/list rows:  py-2
//                 card interiors:   p-5 (comfortable) / p-4 (compact)
//
// No new Tailwind `theme.extend` values are introduced by this convention;
// all values map to Tailwind's existing scale.
// ─────────────────────────────────────────────────────────────────────────────

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        vea: { DEFAULT: '#E30613', light: '#fef2f2' },
        carrefour: { DEFAULT: '#004B93', light: '#eff6ff' },
        dia: { DEFAULT: '#E20032', light: '#fff1f2' },
        masonline: { DEFAULT: '#FF6600', light: '#fff7ed' },
      },
    },
  },
  plugins: [],
} satisfies Config;
