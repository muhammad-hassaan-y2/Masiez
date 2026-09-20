import { GPUDeviceContext } from './Device';
import { Camera } from '../scene/Camera';
import structuresShaderCode from '../shaders/structures.wgsl?raw';

export class StructuresRenderer {
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

        // Create uniform buffer
        this.uniformBuffer = device.createBuffer({
            size: 256,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // 1. Build batched 3D geometry for city, airfield, hangars, and runway lights
        const vertices: number[] = [];
        const indices: number[] = [];

        // Helper to add a 3D box with color and type
        const addBox = (
            cx: number, cy: number, cz: number,
            sx: number, sy: number, sz: number,
            color: [number, number, number, number],
            type: number = 0
        ) => {
            const hx = sx * 0.5, hy = sy * 0.5, hz = sz * 0.5;
            const startIdx = vertices.length / 14;

            const corners = [
                [cx - hx, cy - hy, cz - hz],
                [cx + hx, cy - hy, cz - hz],
                [cx + hx, cy + hy, cz - hz],
                [cx - hx, cy + hy, cz - hz],
                [cx - hx, cy - hy, cz + hz],
                [cx + hx, cy - hy, cz + hz],
                [cx + hx, cy + hy, cz + hz],
                [cx - hx, cy + hy, cz + hz],
            ];

            const faces = [
                { idx: [0, 1, 2, 3], norm: [0, 0, -1] },
                { idx: [5, 4, 7, 6], norm: [0, 0, 1] },
                { idx: [4, 0, 3, 7], norm: [-1, 0, 0] },
                { idx: [1, 5, 6, 2], norm: [1, 0, 0] },
                { idx: [3, 2, 6, 7], norm: [0, 1, 0] },
                { idx: [4, 5, 1, 0], norm: [0, -1, 0] },
            ];

            let vCount = startIdx;
            for (const face of faces) {
                const base = vCount;
                for (let i = 0; i < 4; ++i) {
                    const c = corners[face.idx[i]];
                    // pos(3), norm(3), color(4), extra(4)
                    vertices.push(
                        c[0], c[1], c[2],
                        face.norm[0], face.norm[1], face.norm[2],
                        color[0], color[1], color[2], color[3],
                        0.0, type, 0.0, 0.0
                    );
                }
                indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
                vCount += 4;
            }
        };

        // Helper to add a 3D cylinder
        const addCylinder = (
            cx: number, cy: number, cz: number,
            r: number, h: number, segments: number,
            color: [number, number, number, number],
            type: number = 0
        ) => {
            const startIdx = vertices.length / 14;
            for (let i = 0; i <= segments; ++i) {
                const angle = (i / segments) * Math.PI * 2;
                const cosA = Math.cos(angle);
                const sinA = Math.sin(angle);

                // Bottom vertex
                vertices.push(
                    cx + cosA * r, cy, cz + sinA * r,
                    cosA, 0, sinA,
                    color[0], color[1], color[2], color[3],
                    0.0, type, 0.0, 0.0
                );
                // Top vertex
                vertices.push(
                    cx + cosA * r, cy + h, cz + sinA * r,
                    cosA, 0, sinA,
                    color[0], color[1], color[2], color[3],
                    0.0, type, 0.0, 0.0
                );
            }

            for (let i = 0; i < segments; ++i) {
                const b = startIdx + i * 2;
                indices.push(b, b + 1, b + 3, b, b + 3, b + 2);
            }
        };

        // Helper to add a 3D Waypoint Torus / Ring
        const addRing = (
            cx: number, cy: number, cz: number,
            radius: number, tubeRadius: number,
            color: [number, number, number, number]
        ) => {
            const segRing = 24;
            const segTube = 8;
            const startIdx = vertices.length / 14;

            for (let i = 0; i < segRing; ++i) {
                const theta = (i / segRing) * Math.PI * 2;
                const cosT = Math.cos(theta), sinT = Math.sin(theta);

                for (let j = 0; j < segTube; ++j) {
                    const phi = (j / segTube) * Math.PI * 2;
                    const cosP = Math.cos(phi), sinP = Math.sin(phi);

                    const px = cx + (radius + tubeRadius * cosP) * cosT;
                    const py = cy + tubeRadius * sinP;
                    const pz = cz + (radius + tubeRadius * cosP) * sinT;

                    const nx = cosP * cosT;
                    const ny = sinP;
                    const nz = cosP * sinT;

                    vertices.push(
                        px, py, pz,
                        nx, ny, nz,
                        color[0], color[1], color[2], color[3],
                        1.0, 2.0, 0.0, 0.0
                    );
                }
            }

            for (let i = 0; i < segRing; ++i) {
                const nextI = (i + 1) % segRing;
                for (let j = 0; j < segTube; ++j) {
                    const nextJ = (j + 1) % segTube;
                    const i00 = startIdx + i * segTube + j;
                    const i10 = startIdx + nextI * segTube + j;
                    const i01 = startIdx + i * segTube + nextJ;
                    const i11 = startIdx + nextI * segTube + nextJ;

                    indices.push(i00, i10, i11, i00, i11, i01);
                }
            }
        };

        // Helper to add a 3D Pine Tree
        const addTree = (cx: number, cy: number, cz: number, scale: number = 1.0) => {
            // Trunk
            addBox(cx, cy + 1.2 * scale, cz, 0.4 * scale, 2.4 * scale, 0.4 * scale, [0.4, 0.25, 0.15, 1.0], 3);
            // Foliage layers (stacked green boxes)
            addBox(cx, cy + 3.0 * scale, cz, 3.2 * scale, 2.0 * scale, 3.2 * scale, [0.15, 0.45, 0.2, 1.0], 3);
            addBox(cx, cy + 4.8 * scale, cz, 2.4 * scale, 1.8 * scale, 2.4 * scale, [0.18, 0.52, 0.22, 1.0], 3);
            addBox(cx, cy + 6.2 * scale, cz, 1.5 * scale, 1.5 * scale, 1.5 * scale, [0.22, 0.60, 0.25, 1.0], 3);
        };

        // === 1. AIRFIELD CONTROL TOWER ===
        const towerX = -35, towerZ = -25;
        // Concrete Base & Shaft
        addCylinder(towerX, 0, towerZ, 3.5, 26, 16, [0.75, 0.76, 0.78, 1.0], 0);
        // Glass Observation Deck
        addCylinder(towerX, 26, towerZ, 5.2, 4.5, 16, [0.2, 0.35, 0.5, 0.85], 1);
        // Roof Cap
        addCylinder(towerX, 30.5, towerZ, 5.5, 1.2, 16, [0.25, 0.28, 0.32, 1.0], 0);
        // Antenna Mast
        addBox(towerX, 34, towerZ, 0.3, 6.0, 0.3, [0.9, 0.9, 0.9, 1.0], 0);
        // Red Flashing Beacon Light at top
        addBox(towerX, 37.2, towerZ, 0.8, 0.8, 0.8, [1.0, 0.1, 0.1, 1.0], 4);

        // === 2. AIRCRAFT HANGARS ===
        // Hangar 1 (North)
        addBox(-55, 6, 45, 26, 12, 34, [0.65, 0.7, 0.75, 1.0], 0);
        // Hangar 1 Roof trim
        addBox(-55, 12.5, 45, 28, 1.5, 36, [0.2, 0.35, 0.6, 1.0], 0);
        // Hangar 2 (South)
        addBox(-55, 6, -55, 26, 12, 34, [0.65, 0.7, 0.75, 1.0], 0);
        addBox(-55, 12.5, -55, 28, 1.5, 36, [0.2, 0.35, 0.6, 1.0], 0);

        // Industrial Fuel Tanks
        addCylinder(-78, 0, -20, 6.0, 9.0, 16, [0.85, 0.85, 0.88, 1.0], 0);
        addCylinder(-78, 0, -5, 6.0, 9.0, 16, [0.85, 0.85, 0.88, 1.0], 0);

        // === 3. DOWNTOWN CITY HIGH-RISE DISTRICT ===
        const cityBuildings = [
            { x: 120, z: -40, sx: 20, sy: 55, sz: 20, col: [0.6, 0.68, 0.75, 1.0] as [number, number, number, number] },
            { x: 150, z: -30, sx: 24, sy: 78, sz: 22, col: [0.35, 0.45, 0.58, 1.0] as [number, number, number, number] },
            { x: 180, z: -45, sx: 26, sy: 92, sz: 24, col: [0.25, 0.3, 0.38, 1.0] as [number, number, number, number] },
            { x: 130, z: 0,   sx: 22, sy: 62, sz: 22, col: [0.55, 0.62, 0.7, 1.0] as [number, number, number, number] },
            { x: 165, z: 15,  sx: 28, sy: 110, sz: 28, col: [0.2, 0.35, 0.55, 1.0] as [number, number, number, number] }, // Landmark Tower
            { x: 200, z: 0,   sx: 22, sy: 68, sz: 22, col: [0.7, 0.65, 0.6, 1.0] as [number, number, number, number] },
            { x: 135, z: 50,  sx: 24, sy: 48, sz: 24, col: [0.5, 0.55, 0.6, 1.0] as [number, number, number, number] },
            { x: 175, z: 65,  sx: 26, sy: 82, sz: 24, col: [0.3, 0.4, 0.5, 1.0] as [number, number, number, number] },
            { x: 210, z: 45,  sx: 20, sy: 58, sz: 20, col: [0.65, 0.68, 0.72, 1.0] as [number, number, number, number] },
            { x: 150, z: -85, sx: 25, sy: 45, sz: 25, col: [0.55, 0.58, 0.62, 1.0] as [number, number, number, number] },
            { x: 190, z: -80, sx: 22, sy: 52, sz: 22, col: [0.45, 0.5, 0.58, 1.0] as [number, number, number, number] },
        ];

        for (const b of cityBuildings) {
            // Main skyscraper body
            addBox(b.x, b.sy * 0.5, b.z, b.sx, b.sy, b.sz, b.col, 0);
            // Rooftop HVAC unit
            addBox(b.x, b.sy + 2.0, b.z, b.sx * 0.4, 4.0, b.sz * 0.4, [0.3, 0.32, 0.35, 1.0], 0);
            // Rooftop aviation hazard light
            addBox(b.x, b.sy + 4.5, b.z, 0.6, 0.6, 0.6, [1.0, 0.1, 0.1, 1.0], 4);
        }

        // === 4. RUNWAY 3D LIGHTS & BEACONS ===
        // Threshold Green Lights (North & South ends)
        for (let x = -9; x <= 9; x += 3) {
            addBox(x, 0.3, 162, 0.4, 0.6, 0.4, [0.1, 1.0, 0.3, 1.0], 4);
            addBox(x, 0.3, -162, 0.4, 0.6, 0.4, [0.1, 1.0, 0.3, 1.0], 4);
        }
        // Runway White Edge Lights
        for (let z = -150; z <= 150; z += 25) {
            addBox(-10.5, 0.3, z, 0.3, 0.5, 0.3, [1.0, 0.95, 0.8, 1.0], 4);
            addBox(10.5, 0.3, z, 0.3, 0.5, 0.3, [1.0, 0.95, 0.8, 1.0], 4);
        }

        // === 5. FLIGHT SLALOM PRACTICE WAYPOINT GATES ===
        addRing(0, 10, 45, 4.5, 0.35, [0.0, 0.95, 1.0, 1.0]);    // Gate 1: Cyan
        addRing(30, 16, 95, 4.5, 0.35, [0.1, 1.0, 0.4, 1.0]);   // Gate 2: Neon Green
        addRing(75, 24, 40, 5.0, 0.35, [1.0, 0.85, 0.0, 1.0]);  // Gate 3: Gold
        addRing(65, 18, -45, 4.5, 0.35, [1.0, 0.3, 0.8, 1.0]);  // Gate 4: Magenta
        addRing(20, 12, -75, 4.5, 0.35, [0.2, 0.7, 1.0, 1.0]);  // Gate 5: Electric Blue

        // === 6. NATURAL VEGETATION / TREES ===
        const treePositions = [
            [-20, 20], [-25, 28], [-18, 35], [-30, 10], [-22, -15], [-26, -20],
            [25, 15], [30, 30], [35, -20], [28, -40], [45, 5], [50, 40],
            [-70, 70], [-75, 50], [-80, 20], [-65, -80], [-80, -70],
            [75, -80], [90, -50], [85, 10], [95, 60], [80, 80],
        ];
        for (const [tx, tz] of treePositions) {
            addTree(tx, 0, tz, 1.0 + (Math.sin(tx * 3.7 + tz) * 0.3));
        }

        this.indexCount = indices.length;
        this.vertexBuffer = this.ctx.createBuffer(new Float32Array(vertices), GPUBufferUsage.VERTEX);
        this.indexBuffer = this.ctx.createBuffer(new Uint32Array(indices), GPUBufferUsage.INDEX);

        // 2. Create Render Pipeline
        const shaderModule = device.createShaderModule({ code: structuresShaderCode });
        this.pipeline = device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: shaderModule,
                entryPoint: 'vs_main',
                buffers: [{
                    arrayStride: 14 * 4,
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: 'float32x3' },      // position
                        { shaderLocation: 1, offset: 3 * 4, format: 'float32x3' },  // normal
                        { shaderLocation: 2, offset: 6 * 4, format: 'float32x4' },  // color
                        { shaderLocation: 3, offset: 10 * 4, format: 'float32x4' }, // extra
                    ],
                }],
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fs_main',
                targets: [{
                    format: this.ctx.format,
                    blend: {
                        color: {
                            srcFactor: 'src-alpha',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add',
                        },
                        alpha: {
                            srcFactor: 'one',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add',
                        },
                    },
                }],
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

    public render(pass: GPURenderPassEncoder, camera: Camera, time: number): void {
        const uniforms = new Float32Array(64);
        uniforms.set(camera.viewProjMatrix, 0);
        uniforms[16] = camera.position[0];
        uniforms[17] = camera.position[1];
        uniforms[18] = camera.position[2];
        uniforms[19] = time;

        uniforms[20] = 0.6;
        uniforms[21] = 0.8;
        uniforms[22] = 0.4;
        uniforms[23] = 0.0;

        uniforms[24] = 1.0;
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
