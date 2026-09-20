import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      'drone-autonomy-shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: 'esnext',
  },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
  },
});
