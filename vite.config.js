import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Repo GitHub : juliennuk62-rgb/woodwar-rebuild
// Le site sera servi sur https://juliennuk62-rgb.github.io/woodwar-rebuild/
export default defineConfig({
  plugins: [react()],
  base: '/woodwar-rebuild/',
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
  },
  server: {
    host: true,
    port: 5173,
  },
});
