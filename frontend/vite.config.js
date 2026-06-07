import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies /api → Spring Boot (localhost:8080) so the browser hits a
// same-origin path and we avoid CORS during local development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
