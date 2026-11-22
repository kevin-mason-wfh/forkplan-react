import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: /api is proxied to the backend (avoids CORS). Production (Amplify): a rewrite rule does the same.
const API = process.env.FORKPLAN_API || 'https://kt7490x9c3.execute-api.eu-west-2.amazonaws.com/dev';
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': { target: API, changeOrigin: true, rewrite: p => p.replace(/^\/api/, '') } } },
});
