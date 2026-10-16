import { defineConfig } from 'vite';
import type { PreviewServer, ViteDevServer } from 'vite';
import { livekitTokenMiddleware } from './server/livekitToken';

const livekitTokenPlugin = {
  name: 'livekit-token-endpoint',
  configureServer(server: ViteDevServer) {
    server.middlewares.use(livekitTokenMiddleware);
  },
  configurePreviewServer(server: PreviewServer) {
    server.middlewares.use(livekitTokenMiddleware);
  },
};

export default defineConfig({
  plugins: [livekitTokenPlugin],
  server: {
    allowedHosts: true,
    host: true,
  },
});
