import { GPUDeviceContext } from './Device';
import { Camera } from '../scene/Camera';
import skyShaderCode from '../shaders/sky.wgsl?raw';

export class SkyRenderer {
    private ctx: GPUDeviceContext;
    private pipeline!: GPURenderPipeline;
    private uniformBuffer!: GPUBuffer;
    private bindGroup!: GPUBindGroup;

    constructor(ctx: GPUDeviceContext) {
        this.ctx = ctx;
    }

    public async init(): Promise<void> {
        const device = this.ctx.device;

        this.uniformBuffer = device.createBuffer({
            size: 128,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const shaderModule = device.createShaderModule({ code: skyShaderCode });

        this.pipeline = device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: shaderModule,
                entryPoint: 'vs_main',
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fs_main',
                targets: [{ format: this.ctx.format }],
            },
            primitive: { topology: 'triangle-list' },
            depthStencil: {
                format: this.ctx.depthFormat,
                depthWriteEnabled: false,
                depthCompare: 'less-equal',
            },
        });

        this.bindGroup = device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } },
            ],
        });
    }

    public render(pass: GPURenderPassEncoder, camera: Camera, time: number): void {
        const uniforms = new Float32Array(24);
        uniforms.set(camera.invViewProjMatrix, 0); // 16 floats
        // sunDir (3 floats)
        uniforms[16] = 0.6;
        uniforms[17] = 0.8;
        uniforms[18] = 0.4;
        uniforms[19] = time;

        this.ctx.device.queue.writeBuffer(this.uniformBuffer, 0, uniforms);

        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroup);
        pass.draw(3); // Fullscreen triangle
    }
}
