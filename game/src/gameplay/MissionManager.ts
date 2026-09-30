import { GPUDeviceContext } from '../gpu/Device';
import { Camera } from '../scene/Camera';
import { SoundManager } from './SoundManager';
import ringShaderCode from '../shaders/ring.wgsl?raw';

export interface RingCheckpoint {
    pos: [number, number, number];
    radius: number;
    yawDeg: number;
    passed: boolean;
}

export interface CourseData {
    mapId: string;
    courseName: string;
    rings: RingCheckpoint[];
}

export class MissionManager {
    private ctx: GPUDeviceContext;
    private soundManager: SoundManager;

    private pipeline!: GPURenderPipeline;
    private vertexBuffer!: GPUBuffer;
    private indexBuffer!: GPUBuffer;
    private indexCount: number = 0;

    private uniformBuffer!: GPUBuffer;
    private storageBuffer!: GPUBuffer;
    private bindGroup!: GPUBindGroup;

    private courses: Map<string, RingCheckpoint[]> = new Map();
    private activeCourse: RingCheckpoint[] = [];
    private currentRingIndex: number = 0;

    public score: number = 0;
    public ringsPassed: number = 0;
    public totalRings: number = 0;
    public lapStartTime: number = 0;
    public currentLapTime: number = 0;
    public bestLapTime: number | null = null;
    public isCourseActive: boolean = false;
    public notificationText: string = "";
    public notificationTimer: number = 0;

    constructor(ctx: GPUDeviceContext, soundManager: SoundManager) {
        this.ctx = ctx;
        this.soundManager = soundManager;
        this.initCourses();
    }

    private initCourses(): void {
        // 1. Tram Station Metropolis Course: Elevated tram tracks and skyscraper canyons
        this.courses.set('tram_station', [
            { pos: [0, 6.0, 15], radius: 2.8, yawDeg: 0, passed: false },
            { pos: [12, 9.0, 35], radius: 2.8, yawDeg: 25, passed: false },
            { pos: [30, 14.0, 65], radius: 2.8, yawDeg: 45, passed: false },
            { pos: [45, 18.0, 100], radius: 3.2, yawDeg: 30, passed: false },
            { pos: [30, 15.0, 140], radius: 3.0, yawDeg: -15, passed: false },
            { pos: [-10, 12.0, 160], radius: 2.8, yawDeg: -60, passed: false },
            { pos: [-45, 16.0, 130], radius: 3.0, yawDeg: -120, passed: false },
            { pos: [-60, 20.0, 80], radius: 3.2, yawDeg: -150, passed: false },
            { pos: [-45, 15.0, 30], radius: 2.8, yawDeg: -170, passed: false },
            { pos: [-20, 10.0, -10], radius: 2.8, yawDeg: 160, passed: false },
            { pos: [0, 6.5, 0], radius: 2.8, yawDeg: 0, passed: false },
        ]);

        // 2. Downtown Street Canyons: Tight street turns and plaza gates
        this.courses.set('street_city', [
            { pos: [0, 3.5, 10], radius: 2.4, yawDeg: 0, passed: false },
            { pos: [6, 4.0, 22], radius: 2.4, yawDeg: 20, passed: false },
            { pos: [15, 5.0, 32], radius: 2.4, yawDeg: 45, passed: false },
            { pos: [22, 6.5, 18], radius: 2.4, yawDeg: -45, passed: false },
            { pos: [18, 5.5, 0], radius: 2.4, yawDeg: -120, passed: false },
            { pos: [6, 4.0, -12], radius: 2.4, yawDeg: -160, passed: false },
            { pos: [-8, 4.5, -5], radius: 2.4, yawDeg: 120, passed: false },
            { pos: [0, 3.5, 2], radius: 2.4, yawDeg: 0, passed: false },
        ]);

        // 3. Amsterdam Centraal: Canal waterways, bridges, and historic roofs
        this.courses.set('amsterdam', [
            { pos: [0, 7.0, 20], radius: 3.0, yawDeg: 0, passed: false },
            { pos: [20, 12.0, 45], radius: 3.2, yawDeg: 35, passed: false },
            { pos: [35, 18.0, 80], radius: 3.2, yawDeg: 20, passed: false },
            { pos: [25, 22.0, 120], radius: 3.5, yawDeg: -20, passed: false },
            { pos: [-15, 16.0, 130], radius: 3.2, yawDeg: -80, passed: false },
            { pos: [-40, 12.0, 90], radius: 3.0, yawDeg: -140, passed: false },
            { pos: [-35, 8.0, 40], radius: 2.8, yawDeg: -160, passed: false },
            { pos: [-10, 6.5, 10], radius: 2.8, yawDeg: 140, passed: false },
            { pos: [0, 7.0, 0], radius: 3.0, yawDeg: 0, passed: false },
        ]);

        // 4. Erangel Battleground: Military towers and hills
        this.courses.set('erangel', [
            { pos: [0, 8.0, 25], radius: 3.5, yawDeg: 0, passed: false },
            { pos: [25, 15.0, 60], radius: 3.5, yawDeg: 30, passed: false },
            { pos: [50, 22.0, 110], radius: 3.8, yawDeg: 45, passed: false },
            { pos: [40, 28.0, 160], radius: 4.0, yawDeg: 0, passed: false },
            { pos: [-10, 24.0, 180], radius: 3.8, yawDeg: -70, passed: false },
            { pos: [-55, 18.0, 140], radius: 3.5, yawDeg: -130, passed: false },
            { pos: [-60, 12.0, 70], radius: 3.5, yawDeg: -160, passed: false },
            { pos: [-25, 9.0, 20], radius: 3.2, yawDeg: 150, passed: false },
            { pos: [0, 8.0, 0], radius: 3.5, yawDeg: 0, passed: false },
        ]);

        // 5. Airfield Flight Base
        this.courses.set('airfield', [
            { pos: [0, 5.0, 20], radius: 3.0, yawDeg: 0, passed: false },
            { pos: [0, 9.0, 50], radius: 3.0, yawDeg: 0, passed: false },
            { pos: [15, 14.0, 80], radius: 3.2, yawDeg: 35, passed: false },
            { pos: [30, 20.0, 50], radius: 3.5, yawDeg: 120, passed: false },
            { pos: [20, 16.0, 0], radius: 3.2, yawDeg: 180, passed: false },
            { pos: [-15, 12.0, -20], radius: 3.0, yawDeg: -120, passed: false },
            { pos: [-20, 8.0, 10], radius: 2.8, yawDeg: -45, passed: false },
            { pos: [0, 5.0, 0], radius: 3.0, yawDeg: 0, passed: false },
        ]);
    }

    public async init(): Promise<void> {
        const device = this.ctx.device;

        // Generate Torus mesh for ring: Ring Radius R = 2.4, Tube Radius r = 0.12
        const radialSegments = 32;
        const tubularSegments = 12;
        const R = 2.4;
        const r = 0.12;

        const vertices: number[] = [];
        const indices: number[] = [];

        for (let j = 0; j <= radialSegments; j++) {
            const u = (j / radialSegments) * Math.PI * 2;
            for (let i = 0; i <= tubularSegments; i++) {
                const v = (i / tubularSegments) * Math.PI * 2;

                const x = (R + r * Math.cos(v)) * Math.cos(u);
                const y = (R + r * Math.cos(v)) * Math.sin(u);
                const z = r * Math.sin(v);

                const nx = Math.cos(v) * Math.cos(u);
                const ny = Math.cos(v) * Math.sin(u);
                const nz = Math.sin(v);

                vertices.push(x, y, z, nx, ny, nz);
            }
        }

        for (let j = 1; j <= radialSegments; j++) {
            for (let i = 1; i <= tubularSegments; i++) {
                const a = (tubularSegments + 1) * j + i - 1;
                const b = (tubularSegments + 1) * (j - 1) + i - 1;
                const c = (tubularSegments + 1) * (j - 1) + i;
                const d = (tubularSegments + 1) * j + i;

                indices.push(a, b, d);
                indices.push(b, c, d);
            }
        }

        this.indexCount = indices.length;
        this.vertexBuffer = this.ctx.createBuffer(new Float32Array(vertices), GPUBufferUsage.VERTEX);
        this.indexBuffer = this.ctx.createBuffer(new Uint32Array(indices), GPUBufferUsage.INDEX);

        // Uniforms: 64 + 16 + 16 + 16 = 112 bytes (padded to 128)
        this.uniformBuffer = device.createBuffer({
            size: 128,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Max 32 rings per course, each RingInstance:
        // centerPos (vec3: 12), radius (f32: 4), color (vec4: 16), isActive (u32: 4), isPassed (u32: 4), yawDeg (f32: 4), pad (f32: 4) = 48 bytes
        this.storageBuffer = device.createBuffer({
            size: 32 * 48,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        const shaderModule = device.createShaderModule({ code: ringShaderCode });

        this.pipeline = device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: shaderModule,
                entryPoint: 'vs_main',
                buffers: [{
                    arrayStride: 6 * 4, // pos: 3, normal: 3
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: 'float32x3' },
                        { shaderLocation: 1, offset: 12, format: 'float32x3' },
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
                            dstFactor: 'one', // Additive neon blend
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
            primitive: {
                topology: 'triangle-list',
                cullMode: 'none',
            },
            depthStencil: {
                format: this.ctx.depthFormat,
                depthWriteEnabled: false, // Transparent neon glow
                depthCompare: 'less-equal',
            },
        });

        this.bindGroup = device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } },
                { binding: 1, resource: { buffer: this.storageBuffer } },
            ],
        });

        // Start default course
        this.loadCourse('tram_station');
    }

    public loadCourse(mapId: string): void {
        const template = this.courses.get(mapId) || this.courses.get('airfield') || [];
        this.activeCourse = template.map(r => ({ ...r, passed: false }));
        this.currentRingIndex = 0;
        this.score = 0;
        this.ringsPassed = 0;
        this.totalRings = this.activeCourse.length;
        this.lapStartTime = performance.now();
        this.currentLapTime = 0;
        this.isCourseActive = true;
        this.showNotification(`RACE COURSE LOADED: ${this.totalRings} RINGS!`);
    }

    public update(dronePos: [number, number, number], deltaSec: number): void {
        if (!this.isCourseActive || this.activeCourse.length === 0) return;

        if (this.notificationTimer > 0) {
            this.notificationTimer -= deltaSec;
            if (this.notificationTimer <= 0) {
                this.notificationText = "";
            }
        }

        this.currentLapTime = (performance.now() - this.lapStartTime) / 1000.0;

        // Check collision against current active ring
        if (this.currentRingIndex < this.activeCourse.length) {
            const targetRing = this.activeCourse[this.currentRingIndex];
            const dist = Math.hypot(
                dronePos[0] - targetRing.pos[0],
                dronePos[1] - targetRing.pos[1],
                dronePos[2] - targetRing.pos[2]
            );

            if (dist < targetRing.radius + 0.6) {
                // Ring passed!
                targetRing.passed = true;
                this.ringsPassed++;
                this.score += 150;
                this.currentRingIndex++;

                this.soundManager.playCheckpointChime();
                this.showNotification(`RING ${this.ringsPassed}/${this.totalRings} PASSED! +150 PTS`);

                // Check if all rings completed
                if (this.currentRingIndex >= this.activeCourse.length) {
                    this.soundManager.playLapCompleteChime();
                    if (!this.bestLapTime || this.currentLapTime < this.bestLapTime) {
                        this.bestLapTime = this.currentLapTime;
                        this.showNotification(`COURSE COMPLETE! NEW RECORD: ${this.currentLapTime.toFixed(2)}s!`);
                    } else {
                        this.showNotification(`COURSE COMPLETE! TIME: ${this.currentLapTime.toFixed(2)}s`);
                    }
                }
            }
        }
    }

    public showNotification(text: string): void {
        this.notificationText = text;
        this.notificationTimer = 3.5;
    }

    public render(pass: GPURenderPassEncoder, camera: Camera, timeSec: number): void {
        if (!this.isCourseActive || this.activeCourse.length === 0) return;

        // Write Uniforms
        const uniformData = new Float32Array(28);
        uniformData.set(camera.viewProjMatrix, 0);
        uniformData[16] = camera.position[0];
        uniformData[17] = camera.position[1];
        uniformData[18] = camera.position[2];
        uniformData[19] = timeSec;
        uniformData[20] = 0.0; // ringColor R
        uniformData[21] = 1.0; // ringColor G
        uniformData[22] = 0.8; // ringColor B
        uniformData[23] = 1.0;
        new Uint32Array(uniformData.buffer)[24] = this.currentRingIndex;

        this.ctx.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);

        // Upload Ring instances into Storage Buffer (max 32 rings)
        // Each ring: 12 floats = 48 bytes
        const numRings = Math.min(this.activeCourse.length, 32);
        const ringData = new Float32Array(numRings * 12);

        for (let i = 0; i < numRings; i++) {
            const r = this.activeCourse[i];
            const base = i * 12;

            ringData[base + 0] = r.pos[0];
            ringData[base + 1] = r.pos[1];
            ringData[base + 2] = r.pos[2];
            ringData[base + 3] = r.radius;

            const isActive = (i === this.currentRingIndex) ? 1 : 0;
            const isPassed = r.passed ? 1 : 0;

            if (isActive) {
                // Blazing Cyan-Gold for next target
                ringData[base + 4] = 0.0;
                ringData[base + 5] = 1.0;
                ringData[base + 6] = 0.9;
                ringData[base + 7] = 0.95;
            } else if (isPassed) {
                // Subtle Emerald Green for already cleared
                ringData[base + 4] = 0.1;
                ringData[base + 5] = 0.8;
                ringData[base + 6] = 0.3;
                ringData[base + 7] = 0.35;
            } else {
                // Warm Amber-Orange for upcoming rings in sequence
                ringData[base + 4] = 1.0;
                ringData[base + 5] = 0.65;
                ringData[base + 6] = 0.1;
                ringData[base + 7] = 0.7;
            }

            const uintView = new Uint32Array(ringData.buffer);
            uintView[base + 8] = isActive;
            uintView[base + 9] = isPassed;
            ringData[base + 10] = r.yawDeg;
            ringData[base + 11] = 0.0;
        }

        this.ctx.device.queue.writeBuffer(this.storageBuffer, 0, ringData);

        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroup);
        pass.setVertexBuffer(0, this.vertexBuffer);
        pass.setIndexBuffer(this.indexBuffer, 'uint32');
        pass.drawIndexed(this.indexCount, numRings);
    }

    public getNextRing(): RingCheckpoint | null {
        if (this.currentRingIndex < this.activeCourse.length) {
            return this.activeCourse[this.currentRingIndex];
        }
        return null;
    }
}
