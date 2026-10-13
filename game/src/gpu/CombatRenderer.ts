import { GPUDeviceContext } from './Device';
import { Camera } from '../scene/Camera';
import { EntityManager } from '../gameplay/EntityManager';
import { WeaponSystem } from '../gameplay/WeaponSystem';
import combatShaderCode from '../shaders/combat.wgsl?raw';

export class CombatRenderer {
    private ctx: GPUDeviceContext;
    private pipeline!: GPURenderPipeline;
    private uniformBuffer!: GPUBuffer;
    private bindGroup!: GPUBindGroup;

    private vertexBuffer!: GPUBuffer;
    private maxVertices = 65536;
    private vertexArray = new Float32Array(this.maxVertices * 12);

    constructor(ctx: GPUDeviceContext) {
        this.ctx = ctx;
    }

    public async init(): Promise<void> {
        const device = this.ctx.device;

        this.uniformBuffer = device.createBuffer({
            size: 256,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.vertexBuffer = device.createBuffer({
            size: this.maxVertices * 12 * 4,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        const shaderModule = device.createShaderModule({ code: combatShaderCode });

        this.pipeline = device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: shaderModule,
                entryPoint: 'vs_main',
                buffers: [{
                    arrayStride: 12 * 4,
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: 'float32x3' },
                        { shaderLocation: 1, offset: 3 * 4, format: 'float32x3' },
                        { shaderLocation: 2, offset: 6 * 4, format: 'float32x4' },
                        { shaderLocation: 3, offset: 10 * 4, format: 'float32x2' },
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

    public render(
        pass: GPURenderPassEncoder,
        camera: Camera,
        entityManager: EntityManager,
        weaponSystem: WeaponSystem,
        timeSec: number
    ): void {
        const uniformData = new Float32Array(32);
        uniformData.set(camera.viewProjMatrix, 0);
        uniformData[16] = camera.position[0];
        uniformData[17] = camera.position[1];
        uniformData[18] = camera.position[2];
        uniformData[19] = timeSec;

        uniformData[20] = 0.45;
        uniformData[21] = 0.85;
        uniformData[22] = 0.35;
        uniformData[23] = 0.0;

        uniformData[24] = 1.0;
        uniformData[25] = 0.96;
        uniformData[26] = 0.88;
        uniformData[27] = 0.0;

        this.ctx.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);

        let vOffset = 0;

        const pushVert = (
            px: number, py: number, pz: number,
            nx: number, ny: number, nz: number,
            r: number, g: number, b: number, a: number,
            emissive: number = 0.0,
            type: number = 0
        ) => {
            if (vOffset + 12 > this.vertexArray.length) return;
            this.vertexArray[vOffset + 0] = px;
            this.vertexArray[vOffset + 1] = py;
            this.vertexArray[vOffset + 2] = pz;
            this.vertexArray[vOffset + 3] = nx;
            this.vertexArray[vOffset + 4] = ny;
            this.vertexArray[vOffset + 5] = nz;
            this.vertexArray[vOffset + 6] = r;
            this.vertexArray[vOffset + 7] = g;
            this.vertexArray[vOffset + 8] = b;
            this.vertexArray[vOffset + 9] = a;
            this.vertexArray[vOffset + 10] = emissive;
            this.vertexArray[vOffset + 11] = type;
            vOffset += 12;
        };

        const addBox = (
            cx: number, cy: number, cz: number,
            sx: number, sy: number, sz: number,
            yawDeg: number,
            color: [number, number, number, number],
            emissive: number = 0
        ) => {
            const hx = sx * 0.5, hy = sy * 0.5, hz = sz * 0.5;
            const yawRad = yawDeg * (Math.PI / 180.0);
            const cyaw = Math.cos(yawRad), syaw = Math.sin(yawRad);

            const rot = (x: number, y: number, z: number): [number, number, number] => {
                return [
                    cx + x * cyaw + z * syaw,
                    cy + y,
                    cz - x * syaw + z * cyaw
                ];
            };

            const corners = [
                rot(-hx, -hy, -hz), rot(hx, -hy, -hz), rot(hx, hy, -hz), rot(-hx, hy, -hz),
                rot(-hx, -hy, hz),  rot(hx, -hy, hz),  rot(hx, hy, hz),  rot(-hx, hy, hz),
            ];

            const faces = [
                { idx: [0, 1, 2, 0, 2, 3], norm: rot(0, 0, -1) },
                { idx: [5, 4, 7, 5, 7, 6], norm: rot(0, 0, 1) },
                { idx: [4, 0, 3, 4, 3, 7], norm: rot(-1, 0, 0) },
                { idx: [1, 5, 6, 1, 6, 2], norm: rot(1, 0, 0) },
                { idx: [3, 2, 6, 3, 6, 7], norm: rot(0, 1, 0) },
                { idx: [4, 5, 1, 4, 1, 0], norm: rot(0, -1, 0) },
            ];

            for (const f of faces) {
                const nx = f.norm[0] - cx, ny = f.norm[1] - cy, nz = f.norm[2] - cz;
                const len = Math.hypot(nx, ny, nz) || 1;
                for (const i of f.idx) {
                    const c = corners[i];
                    pushVert(c[0], c[1], c[2], nx / len, ny / len, nz / len, color[0], color[1], color[2], color[3], emissive);
                }
            }
        };

        // 1. Render Soldiers and Tanks as Simple Boxes (ready to swap with 3D assets later)
        for (const ent of entityManager.entities) {
            if (!ent.isAlive) continue;

            const px = ent.pos[0], py = ent.pos[1], pz = ent.pos[2];
            const yaw = ent.headingDeg;

            if (ent.type === 'SOLDIER') {
                // Simple box placeholder for Soldier
                addBox(px, py + ent.height * 0.5, pz, 0.6, ent.height, 0.6, yaw, ent.color);
            } else if (ent.type === 'TANK') {
                // Simple box placeholder for Tank
                addBox(px, py + ent.height * 0.5, pz, 2.6, ent.height, 4.8, yaw, ent.color);
            }
        }

        // 2. Render Projectiles
        for (const proj of weaponSystem.projectiles) {
            const vx = proj.vel[0], vy = proj.vel[1], vz = proj.vel[2];
            const vLen = Math.hypot(vx, vy, vz) || 1;
            const normV = [vx / vLen, vy / vLen, vz / vLen];
            const projYaw = Math.atan2(normV[0], normV[2]) * (180 / Math.PI);

            if (proj.kind === 'TANK_SHELL' || proj.kind === 'ARTILLERY_SHELL' || proj.kind === 'RPG_ROCKET') {
                addBox(proj.pos[0], proj.pos[1], proj.pos[2], 0.30, 0.30, 1.6, projYaw, [1.0, 0.65, 0.15, 1.0], 1.0);
            } else {
                const boltLen = proj.isRailgun ? 3.6 : (proj.kind === 'TRACER' ? 2.2 : 1.8);
                const thickness = proj.isRailgun ? 0.22 : (proj.kind === 'TRACER' ? 0.10 : 0.12);
                const p0x = proj.pos[0] - normV[0] * boltLen;
                const p0y = proj.pos[1] - normV[1] * boltLen;
                const p0z = proj.pos[2] - normV[2] * boltLen;

                addBox(
                    (proj.pos[0] + p0x) * 0.5,
                    (proj.pos[1] + p0y) * 0.5,
                    (proj.pos[2] + p0z) * 0.5,
                    thickness, thickness, boltLen,
                    projYaw,
                    proj.color,
                    1.0
                );
            }
        }

        // 3. Render Impact, Smoke, and Explosion Particles
        for (const part of weaponSystem.particles) {
            const sz = part.size ?? 0.20;
            addBox(part.pos[0], part.pos[1], part.pos[2], sz, sz, sz, 0, part.color, 1.0);
        }

        const vertCount = vOffset / 12;
        if (vertCount === 0) return;

        this.ctx.device.queue.writeBuffer(
            this.vertexBuffer,
            0,
            this.vertexArray.buffer,
            0,
            vOffset * 4
        );

        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroup);
        pass.setVertexBuffer(0, this.vertexBuffer);
        pass.draw(vertCount);
    }
}
