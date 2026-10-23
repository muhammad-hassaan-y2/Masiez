import { defineConfig } from 'vite';
import { wasm } from './src/wasm/vite';

export default defineConfig({
  plugins: [wasm()],
  server: {
    allowedHosts: true,
    host: true,
  },
});
