import { GPUDeviceContext } from './Device';
import { Camera } from '../scene/Camera';
import terrainShaderCode from '../shaders/terrain.wgsl?raw';

export class TerrainRenderer {
    private ctx: GPUDeviceContext;
    private pipeline!: GPURenderPipeline;
    private vertexBuffer!: GPUBuffer;
    private indexBuffer!: GPUBuffer;
    private indexCount: number = 0;

    private uniformBuffer!: GPUBuffer;
    private bindGroup!: GPUBindGroup;
    private sampler!: GPUSampler;

    constructor(ctx: GPUDeviceContext) {
        this.ctx = ctx;
    }

    public async init(): Promise<void> {
        const device = this.ctx.device;

        // 1. Create Terrain Grid Geometry (128x128 quad grid for smooth 1km x 1km terrain)
        const GRID_RES = 128;
        const SIZE = 1000.0;

        const vertices: number[] = [];
        for (let y = 0; y <= GRID_RES; ++y) {
            for (let x = 0; x <= GRID_RES; ++x) {
                const u = x / GRID_RES;
                const v = y / GRID_RES;
                const px = (u - 0.5) * SIZE;
                const pz = (v - 0.5) * SIZE;
                vertices.push(px, 0.0, pz, u, v);
            }
        }

        const indices: number[] = [];
        for (let y = 0; y < GRID_RES; ++y) {
            for (let x = 0; x < GRID_RES; ++x) {
                const i0 = y * (GRID_RES + 1) + x;
                const i1 = i0 + 1;
                const i2 = (y + 1) * (GRID_RES + 1) + x;
                const i3 = i2 + 1;

                indices.push(i0, i2, i1);
                indices.push(i1, i2, i3);
            }
        }
        this.indexCount = indices.length;

        this.vertexBuffer = this.ctx.createBuffer(new Float32Array(vertices), GPUBufferUsage.VERTEX);
        this.indexBuffer = this.ctx.createBuffer(new Uint32Array(indices), GPUBufferUsage.INDEX);

        // 2. Uniform buffer (256 bytes)
        this.uniformBuffer = device.createBuffer({
            size: 256,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // 3. Load Textures with resilient fallbacks
        const heightmapTex = await this.ctx.loadTexture('/assets/terrain/heightmap.png', [128, 128, 128]);
        const normalmapTex = await this.ctx.loadTexture('/assets/terrain/normalmap.png', [128, 128, 255]);
        const grassAlbedoTex = await this.ctx.loadTexture('/assets/textures/grass/albedo.jpg', [70, 130, 50]);
        const rockAlbedoTex = await this.ctx.loadTexture('/assets/textures/rock/albedo.jpg', [120, 110, 100]);
        const grassNormalTex = await this.ctx.loadTexture('/assets/textures/grass/normal.jpg', [128, 128, 255]);
        const rockNormalTex = await this.ctx.loadTexture('/assets/textures/rock/normal.jpg', [128, 128, 255]);

        this.sampler = device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
            addressModeU: 'repeat',
            addressModeV: 'repeat',
        });

        // 4. Create Shader & Pipeline
        const shaderModule = device.createShaderModule({ code: terrainShaderCode });

        this.pipeline = device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: shaderModule,
                entryPoint: 'vs_main',
                buffers: [{
                    arrayStride: 5 * 4,
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: 'float32x3' }, // position
                        { shaderLocation: 1, offset: 3 * 4, format: 'float32x2' }, // uv
                    ],
                }],
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fs_main',
                targets: [{ format: this.ctx.format }],
            },
            primitive: { topology: 'triangle-list', cullMode: 'none' },
            depthStencil: {
                format: this.ctx.depthFormat,
                depthWriteEnabled: true,
                depthCompare: 'less-equal',
            },
        });

        this.bindGroup = device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } },
                { binding: 1, resource: heightmapTex.createView() },
                { binding: 2, resource: normalmapTex.createView() },
                { binding: 3, resource: grassAlbedoTex.createView() },
                { binding: 4, resource: rockAlbedoTex.createView() },
                { binding: 5, resource: grassNormalTex.createView() },
                { binding: 6, resource: rockNormalTex.createView() },
                { binding: 7, resource: this.sampler },
            ],
        });
    }

    public render(pass: GPURenderPassEncoder, camera: Camera, time: number): void {
        const uniforms = new Float32Array(64); // 256 bytes
        uniforms.set(camera.viewProjMatrix, 0); // 16 floats (0..15)
        uniforms[16] = camera.position[0];      // 16
        uniforms[17] = camera.position[1];      // 17
        uniforms[18] = camera.position[2];      // 18
        uniforms[19] = time;                    // 19

        uniforms[20] = 0.6; // sunDir (20..22)
        uniforms[21] = 0.8;
        uniforms[22] = 0.4;
        uniforms[23] = 0.0; // padding to offset 96

        uniforms[24] = 1.0; // sunColor (24..26)
        uniforms[25] = 0.95;
        uniforms[26] = 0.85;
        uniforms[27] = 0.0;

        this.ctx.device.queue.writeBuffer(this.uniformBuffer, 0, uniforms);

        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroup);
        pass.setVertexBuffer(0, this.vertexBuffer);
        pass.setIndexBuffer(this.indexBuffer, 'uint32');
        pass.drawIndexed(this.indexCount);
    }
}
