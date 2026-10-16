import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// Cross-origin isolation lets ONNX Runtime Web use threaded SIMD WASM;
// every asset in this app is same-origin, so COEP breaks nothing.
const coiHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        { src: '../../node_modules/onnxruntime-web/dist/*.wasm', dest: 'onnxruntime', rename: { stripBase: true } },
      ],
    }),
  ],
  server: {
    allowedHosts: true,
    host: true,
    headers: coiHeaders,
  },
  preview: {
    headers: coiHeaders,
  },
  build: {
    target: 'esnext',
  },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
  },
});
