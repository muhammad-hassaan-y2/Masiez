import { GPUDeviceContext } from './Device';
import { Camera } from '../scene/Camera';
import { terrainHeight, terrainNormal } from '../gameplay/Terrain';
import fieldShaderCode from '../shaders/field.wgsl?raw';

const GRID_RES = 220;
const FIELD_HALF_SIZE = 2200.0;

export class FieldRenderer {
    private ctx: GPUDeviceContext;
    private pipeline!: GPURenderPipeline;
    private vertexBuffer!: GPUBuffer;
    private indexBuffer!: GPUBuffer;
    private indexCount: number = 0;
    private uniformBuffer!: GPUBuffer;
    private bindGroup!: GPUBindGroup;

    constructor(ctx: GPUDeviceContext) {
        this.ctx = ctx;
    }

    public async init(): Promise<void> {
        const device = this.ctx.device;

        const vertices: number[] = [];
        for (let iz = 0; iz <= GRID_RES; iz++) {
            for (let ix = 0; ix <= GRID_RES; ix++) {
                const x = (ix / GRID_RES - 0.5) * 2.0 * FIELD_HALF_SIZE;
                const z = (iz / GRID_RES - 0.5) * 2.0 * FIELD_HALF_SIZE;
                const normal = terrainNormal(x, z);
                vertices.push(x, terrainHeight(x, z), z, normal[0], normal[1], normal[2]);
            }
        }

        const indices: number[] = [];
        for (let iz = 0; iz < GRID_RES; iz++) {
            for (let ix = 0; ix < GRID_RES; ix++) {
                const i0 = iz * (GRID_RES + 1) + ix;
                const i1 = i0 + 1;
                const i2 = (iz + 1) * (GRID_RES + 1) + ix;
                const i3 = i2 + 1;
                indices.push(i0, i2, i1, i1, i2, i3);
            }
        }

        const vertexBuffer = new Float32Array(vertices);
        const indexBuffer = new Uint32Array(indices);
        this.indexCount = indices.length;

        this.vertexBuffer = this.ctx.createBuffer(vertexBuffer, GPUBufferUsage.VERTEX);
        this.indexBuffer = this.ctx.createBuffer(indexBuffer, GPUBufferUsage.INDEX);

        this.uniformBuffer = device.createBuffer({
            size: 256,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const shaderModule = device.createShaderModule({ code: fieldShaderCode });

        this.pipeline = device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: shaderModule,
                entryPoint: 'vs_main',
                buffers: [{
                    arrayStride: 6 * 4,
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: 'float32x3' },
                        { shaderLocation: 1, offset: 3 * 4, format: 'float32x3' },
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
            ],
        });
    }

    public render(pass: GPURenderPassEncoder, camera: Camera): void {
        const uniforms = new Float32Array(64);
        uniforms.set(camera.viewProjMatrix, 0);
        uniforms[16] = camera.position[0];
        uniforms[17] = camera.position[1];
        uniforms[18] = camera.position[2];
        uniforms[20] = 0.6;
        uniforms[21] = 0.8;
        uniforms[22] = 0.4;
        uniforms[24] = 1.0;
        uniforms[25] = 0.97;
        uniforms[26] = 0.9;

        this.ctx.device.queue.writeBuffer(this.uniformBuffer, 0, uniforms);

        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroup);
        pass.setVertexBuffer(0, this.vertexBuffer);
        pass.setIndexBuffer(this.indexBuffer, 'uint32');
        pass.drawIndexed(this.indexCount);
    }
}
