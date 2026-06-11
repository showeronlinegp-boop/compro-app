import type { Config } from 'tailwindcss';

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
