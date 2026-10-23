import type { Plugin } from 'vite';
import { execFileSync, spawnSync } from 'node:child_process';
import { watch } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const wasmDir = dirname(fileURLToPath(import.meta.url));

export function wasm(): Plugin {
    return {
        name: 'wasm',
        configureServer(server) {
            if (spawnSync('emcc', ['--version'], { stdio: 'ignore' }).error) {
                server.config.logger.warn('emcc not found; C++ changes will not rebuild physics.wasm');
                return;
            }

            let building = false;
            let queued = false;

            const build = () => {
                if (building) {
                    queued = true;
                    return;
                }
                building = true;
                try {
                    execFileSync('bash', [join(wasmDir, 'build.sh')], { stdio: 'inherit' });
                    server.ws.send({ type: 'full-reload' });
                } catch {
                    server.config.logger.error('physics.wasm build failed');
                } finally {
                    building = false;
                    if (queued) {
                        queued = false;
                        build();
                    }
                }
            };

            watch(wasmDir, { recursive: true }, (_event, file) => {
                if (file && /\.(cpp|h)$/.test(file)) {
                    build();
                }
            });
        },
    };
}
