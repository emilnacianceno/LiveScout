import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', ''); // root .env
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: { '/api': `http://localhost:${env.BACKEND_PORT ?? 3001}` },
    },
  };
});
