import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // API_PROXY_TARGET: la vista previa de una nota de prueba puede apuntar a otro
      // backend (skill nota-prueba). Sin prefijo VITE_: no llega al navegador.
      '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:3001',
    },
  },
});
