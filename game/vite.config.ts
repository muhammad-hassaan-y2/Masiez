import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    allowedHosts: true,
    host: true,
  },
  build: {
    target: 'esnext',
  },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
  },
});
