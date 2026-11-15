import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Renderer build only; the Electron main/preload processes are compiled
// separately via tsconfig.electron.json.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
  },
  server: {
    // Explicit IPv4: `npm run dev` waits on 127.0.0.1:5173, and localhost can
    // resolve to ::1 alone, which left the wait hanging.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
});
