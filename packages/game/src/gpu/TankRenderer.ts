import { GPUDeviceContext } from './Device';
import { Camera } from '../scene/Camera';
import { AABB, OBB } from '../gameplay/CollisionSystem';
import { terrainHeight } from '../gameplay/Terrain';
import { loadGltf, GltfModel } from './GltfModel';
import tankShaderCode from '../shaders/tank.wgsl?raw';

interface TankPlacement {
    x: number;
    z: number;
    yaw: number;
}

interface TankInstance {
    uniformBuffer: GPUBuffer;
    bindGroups: GPUBindGroup[];
    collider: AABB;
    obstacle: OBB;
}

const TANKS: TankPlacement[] = [
    { x: 46, z: 38, yaw: 0.5 },
    { x: 62, z: 50, yaw: 2.2 },
    { x: -38, z: 64, yaw: 1.1 },
    { x: -72, z: -30, yaw: 2.9 },
    { x: 18, z: -66, yaw: 0.2 },
    { x: 98, z: -14, yaw: 4.0 },
    { x: -24, z: -98, yaw: 5.2 },
    { x: 122, z: 86, yaw: 3.3 },
    { x: -112, z: 42, yaw: 0.9 },
    { x: 72, z: 132, yaw: 1.8 },
    { x: -150, z: -120, yaw: 0.4 },
    { x: 160, z: 10, yaw: 2.5 },
];

const MODEL_URL = '/assets/models/light_autonomous_tank.glb';
const TANK_SCALE = 1.5;
const TANK_SPREAD = 1.0;

export class TankRenderer {
    private ctx: GPUDeviceContext;
    private pipeline!: GPURenderPipeline;
    private sampler!: GPUSampler;
    private frameBuffer!: GPUBuffer;
    private frameBindGroup!: GPUBindGroup;
    private model: GltfModel | undefined;
    private instances: TankInstance[] = [];
    private destroyedTanks: Set<number> = new Set();

    constructor(ctx: GPUDeviceContext) {
        this.ctx = ctx;
    }

    public getColliders(): AABB[] {
        return this.instances.map((instance) => instance.collider);
    }

    public getObstacles(): OBB[] {
        return this.instances.map((instance) => instance.obstacle);
    }

    public get destroyedCount(): number {
        return this.destroyedTanks.size;
    }

    public get totalCount(): number {
        return this.instances.length;
    }

    public destroyTank(index: number): boolean {
        if (index < 0 || index >= this.instances.length || this.destroyedTanks.has(index)) {
            return false;
        }
        this.destroyedTanks.add(index);
        return true;
    }

    public resetTanks(): void {
        this.destroyedTanks.clear();
    }

    public async init(): Promise<void> {
        const device = this.ctx.device;

        this.model = await loadGltf(this.ctx, MODEL_URL);
        if (!this.model) {
            throw new Error(`Unable to load tank model: ${MODEL_URL}`);
        }

        this.sampler = device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
            mipmapFilter: 'linear',
        });

        this.frameBuffer = device.createBuffer({
            size: 112,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const shaderModule = device.createShaderModule({ code: tankShaderCode });
        this.pipeline = device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: shaderModule,
                entryPoint: 'vs_main',
                buffers: [{
                    arrayStride: 8 * 4,
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: 'float32x3' },
                        { shaderLocation: 1, offset: 3 * 4, format: 'float32x3' },
                        { shaderLocation: 2, offset: 6 * 4, format: 'float32x2' },
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

        this.frameBindGroup = device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.frameBuffer } },
            ],
        });

        const modelBindGroupLayout = this.pipeline.getBindGroupLayout(1);
        const localMin = this.model.min;
        const localMax = this.model.max;
        const localCenterX = (localMin[0] + localMax[0]) * 0.5;
        const localCenterZ = (localMin[2] + localMax[2]) * 0.5;
        const halfX = (localMax[0] - localMin[0]) * 0.5;
        const halfZ = (localMax[2] - localMin[2]) * 0.5;

        for (const tank of TANKS) {
            const tankX = tank.x * TANK_SPREAD;
            const tankZ = tank.z * TANK_SPREAD;
            const baseY = terrainHeight(tankX, tankZ);
            const cos = Math.cos(tank.yaw);
            const sin = Math.sin(tank.yaw);

            const uniformBuffer = device.createBuffer({
                size: 96,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });

            const bindGroups: GPUBindGroup[] = [];
            for (const primitive of this.model.primitives) {
                const uniforms = new Float32Array(24);
                uniforms[0] = cos * TANK_SCALE;
                uniforms[1] = 0;
                uniforms[2] = sin * TANK_SCALE;
                uniforms[3] = 0;
                uniforms[4] = 0;
                uniforms[5] = TANK_SCALE;
                uniforms[6] = 0;
                uniforms[7] = 0;
                uniforms[8] = -sin * TANK_SCALE;
                uniforms[9] = 0;
                uniforms[10] = cos * TANK_SCALE;
                uniforms[11] = 0;
                uniforms[12] = tankX;
                uniforms[13] = baseY;
                uniforms[14] = tankZ;
                uniforms[15] = 1;
                uniforms[16] = primitive.baseColorFactor[0];
                uniforms[17] = primitive.baseColorFactor[1];
                uniforms[18] = primitive.baseColorFactor[2];
                uniforms[19] = primitive.baseColorFactor[3];
                new Uint32Array(uniforms.buffer)[20] = primitive.hasTexture ? 1 : 0;
                device.queue.writeBuffer(uniformBuffer, 0, uniforms);

                bindGroups.push(device.createBindGroup({
                    layout: modelBindGroupLayout,
                    entries: [
                        { binding: 0, resource: { buffer: uniformBuffer } },
                        { binding: 1, resource: primitive.textureView },
                        { binding: 2, resource: this.sampler },
                    ],
                }));
            }

            const worldCenterX = tankX + (localCenterX * cos - localCenterZ * sin) * TANK_SCALE;
            const worldCenterY = baseY + (localMin[1] + localMax[1]) * 0.5 * TANK_SCALE;
            const worldCenterZ = tankZ + (localCenterX * sin + localCenterZ * cos) * TANK_SCALE;
            const halfY = (localMax[1] - localMin[1]) * 0.5 * TANK_SCALE;
            const extentX = (Math.abs(halfX * cos) + Math.abs(halfZ * sin)) * TANK_SCALE;
            const extentZ = (Math.abs(halfX * sin) + Math.abs(halfZ * cos)) * TANK_SCALE;

            this.instances.push({
                uniformBuffer,
                bindGroups,
                collider: {
                    id: `tank_${this.instances.length}`,
                    min: [worldCenterX - extentX - 0.05, baseY + localMin[1] * TANK_SCALE - 0.2, worldCenterZ - extentZ - 0.05],
                    max: [worldCenterX + extentX + 0.05, baseY + localMax[1] * TANK_SCALE, worldCenterZ + extentZ + 0.05],
                },
                obstacle: {
                    id: `tank_${this.instances.length}`,
                    center: [worldCenterX, worldCenterY, worldCenterZ],
                    half: [halfX * TANK_SCALE, halfY, halfZ * TANK_SCALE],
                    yaw: tank.yaw,
                },
            });
        }
    }

    public render(pass: GPURenderPassEncoder, camera: Camera): void {
        if (!this.model) return;

        const frame = new Float32Array(28);
        frame.set(camera.viewProjMatrix, 0);
        frame[16] = camera.position[0];
        frame[17] = camera.position[1];
        frame[18] = camera.position[2];
        frame[19] = 0;
        frame[20] = 0.6;
        frame[21] = 0.8;
        frame[22] = 0.4;
        frame[23] = 0;
        frame[24] = 1.0;
        frame[25] = 0.95;
        frame[26] = 0.85;
        frame[27] = 0;
        this.ctx.device.queue.writeBuffer(this.frameBuffer, 0, frame);

        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.frameBindGroup);

        for (let i = 0; i < this.instances.length; i++) {
            if (this.destroyedTanks.has(i)) continue;
            const instance = this.instances[i];
            for (let p = 0; p < this.model.primitives.length; p++) {
                const primitive = this.model.primitives[p];
                pass.setBindGroup(1, instance.bindGroups[p]);
                pass.setVertexBuffer(0, primitive.vertexBuffer);
                pass.setIndexBuffer(primitive.indexBuffer, 'uint32');
                pass.drawIndexed(primitive.indexCount);
            }
        }
    }
}
