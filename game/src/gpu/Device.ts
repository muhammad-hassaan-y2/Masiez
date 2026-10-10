export class GPUDeviceContext {
    public device!: GPUDevice;
    public adapter!: GPUAdapter;
    public context!: GPUCanvasContext;
    public format!: GPUTextureFormat;
    public depthFormat: GPUTextureFormat = 'depth24plus';
    public depthTexture!: GPUTexture;
    public canvas: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    public async init(): Promise<boolean> {
        if (!navigator.gpu) {
            console.error("WebGPU is not supported on this browser.");
            const errEl = document.getElementById('error-console');
            if (errEl) {
                errEl.style.display = 'block';
                errEl.innerHTML += `<div><b>Error:</b> WebGPU is not supported on this browser. Use Chrome 113+ or Edge 113+.</div>`;
            }
            return false;
        }

        let adapter = await navigator.gpu.requestAdapter({
            powerPreference: 'high-performance'
        });
        if (!adapter) {
            adapter = await navigator.gpu.requestAdapter();
        }
        if (!adapter) {
            console.error("No suitable GPUAdapter found.");
            const errEl = document.getElementById('error-console');
            if (errEl) {
                errEl.style.display = 'block';
                errEl.innerHTML += `<div><b>WebGPU Adapter Error:</b> No compatible GPU adapter found. Ensure hardware acceleration is enabled in your browser settings (chrome://settings/system).</div>`;
            }
            return false;
        }
        this.adapter = adapter;

        this.device = await adapter.requestDevice();

        this.device.addEventListener('uncapturederror', (event: any) => {
            console.error('WebGPU Uncaptured Error:', event.error);
            const errEl = document.getElementById('error-console');
            if (errEl) {
                errEl.style.display = 'block';
                errEl.innerHTML += `<div><b>WebGPU Error:</b> ${event.error?.message || event.error}</div>`;
            }
        });

        const ctx = this.canvas.getContext('webgpu');
        if (!ctx) {
            console.error("Failed to get WebGPU canvas context.");
            return false;
        }
        this.context = ctx;

        this.format = navigator.gpu.getPreferredCanvasFormat();
        this.resize();

        window.addEventListener('resize', () => this.resize());
        return true;
    }

    public resize(): void {
        const width = Math.max(1, window.innerWidth);
        const height = Math.max(1, window.innerHeight);

        this.canvas.width = width;
        this.canvas.height = height;

        this.context.configure({
            device: this.device,
            format: this.format,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
            alphaMode: 'opaque',
        });

        if (this.depthTexture) {
            this.depthTexture.destroy();
        }

        this.depthTexture = this.device.createTexture({
            size: [width, height, 1],
            format: this.depthFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
    }

    public createBuffer(data: ArrayBufferView, usage: GPUBufferUsageFlags): GPUBuffer {
        const buffer = this.device.createBuffer({
            size: Math.ceil(data.byteLength / 4) * 4,
            usage,
            mappedAtCreation: true,
        });
        if (data instanceof Float32Array) {
            new Float32Array(buffer.getMappedRange()).set(data);
        } else if (data instanceof Uint16Array) {
            new Uint16Array(buffer.getMappedRange()).set(data);
        } else if (data instanceof Uint32Array) {
            new Uint32Array(buffer.getMappedRange()).set(data);
        } else if (data instanceof Uint8Array) {
            new Uint8Array(buffer.getMappedRange()).set(data);
        }
        buffer.unmap();
        return buffer;
    }

    public createFallbackSolidTexture(r: number, g: number, b: number, a: number = 255): GPUTexture {
        const texture = this.device.createTexture({
            size: [2, 2, 1],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        const data = new Uint8Array([
            r, g, b, a,  r, g, b, a,
            r, g, b, a,  r, g, b, a
        ]);
        this.device.queue.writeTexture(
            { texture },
            data,
            { bytesPerRow: 8 },
            [2, 2]
        );
        return texture;
    }

    public async loadTexture(url: string, fallbackColor: [number, number, number] = [128, 128, 128]): Promise<GPUTexture> {
        try {
            const res = await fetch(url);
            if (!res.ok) {
                console.warn(`Failed to fetch texture ${url}, using fallback color.`);
                return this.createFallbackSolidTexture(fallbackColor[0], fallbackColor[1], fallbackColor[2]);
            }
            const blob = await res.blob();
            const imgBitmap = await createImageBitmap(blob);

            const texture = this.device.createTexture({
                size: [imgBitmap.width, imgBitmap.height, 1],
                format: 'rgba8unorm',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
            });

            this.device.queue.copyExternalImageToTexture(
                { source: imgBitmap },
                { texture },
                [imgBitmap.width, imgBitmap.height]
            );

            return texture;
        } catch (e) {
            console.warn(`Error loading texture ${url}:`, e);
            return this.createFallbackSolidTexture(fallbackColor[0], fallbackColor[1], fallbackColor[2]);
        }
    }
}
