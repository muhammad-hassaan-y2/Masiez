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
    private vertexArray = new Float32Array(this.maxVertices * 12); // pos(3), norm(3), color(4), extra(2) = 12 floats = 48 bytes

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
                        { shaderLocation: 0, offset: 0, format: 'float32x3' },       // pos
                        { shaderLocation: 1, offset: 3 * 4, format: 'float32x3' },   // norm
                        { shaderLocation: 2, offset: 6 * 4, format: 'float32x4' },   // color
                        { shaderLocation: 3, offset: 10 * 4, format: 'float32x2' },  // extra: emissive, type
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
        // Update Uniforms
        const uniformData = new Float32Array(32);
        uniformData.set(camera.viewProjMatrix, 0); // 16 floats
        uniformData[16] = camera.position[0];
        uniformData[17] = camera.position[1];
        uniformData[18] = camera.position[2];
        uniformData[19] = timeSec;

        // Sun direction (3) + pad (1)
        uniformData[20] = 0.45;
        uniformData[21] = 0.85;
        uniformData[22] = 0.35;
        uniformData[23] = 0.0;

        // Sun color (3) + pad (1)
        uniformData[24] = 1.0;
        uniformData[25] = 0.96;
        uniformData[26] = 0.88;
        uniformData[27] = 0.0;

        this.ctx.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);

        // Build dynamic batched geometry for this frame
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

        /**
         * Places a box at local offset (ox, oy, oz) rotated by baseYawDeg around (px, py, pz)
         */
        const addPart = (
            px: number, py: number, pz: number,
            baseYawDeg: number,
            ox: number, oy: number, oz: number,
            sx: number, sy: number, sz: number,
            color: [number, number, number, number],
            emissive: number = 0,
            extraYawDeg: number = 0
        ) => {
            const bRad = baseYawDeg * (Math.PI / 180.0);
            const cb = Math.cos(bRad), sb = Math.sin(bRad);
            const wx = px + ox * cb + oz * sb;
            const wy = py + oy;
            const wz = pz - ox * sb + oz * cb;
            addBox(wx, wy, wz, sx, sy, sz, baseYawDeg + extraYawDeg, color, emissive);
        };

        // 1. Render Moving Entities
        for (const ent of entityManager.entities) {
            if (!ent.isAlive) continue;

            const px = ent.pos[0], py = ent.pos[1], pz = ent.pos[2];
            const yaw = ent.headingDeg;

            if (ent.type === 'PERSON') {
                // Procedural Human Character: Head, Torso (Vest), Arms, Legs
                const walkCycle = Math.sin(ent.walkPhase);
                const legSwing1 = walkCycle * 0.18;
                const legSwing2 = -walkCycle * 0.18;

                // Legs (dark work pants)
                addPart(px, py, pz, yaw, -0.12, 0.42, legSwing1, 0.15, 0.8, 0.18, [0.15, 0.18, 0.22, 1.0]);
                addPart(px, py, pz, yaw, 0.12, 0.42, legSwing2, 0.15, 0.8, 0.18, [0.15, 0.18, 0.22, 1.0]);

                // Torso with High-Vis Safety Vest
                addPart(px, py, pz, yaw, 0, 1.15, 0, 0.42, 0.65, 0.25, ent.color);
                addPart(px, py, pz, yaw, 0, 1.15, 0, 0.44, 0.12, 0.26, [0.95, 0.95, 0.95, 1.0], 0.8);

                // Arms
                addPart(px, py, pz, yaw, -0.26, 1.1, -legSwing1 * 0.8, 0.12, 0.55, 0.14, [0.2, 0.25, 0.35, 1.0]);
                addPart(px, py, pz, yaw, 0.26, 1.1, -legSwing2 * 0.8, 0.12, 0.55, 0.14, [0.2, 0.25, 0.35, 1.0]);

                // Head with Safety Hardhat
                addPart(px, py, pz, yaw, 0, 1.62, 0, 0.24, 0.25, 0.24, [0.88, 0.68, 0.52, 1.0]);
                addPart(px, py, pz, yaw, 0, 1.76, 0, 0.28, 0.14, 0.30, [0.95, 0.85, 0.1, 1.0]);
            } else if (ent.type === 'SOLDIER') {
                // Armed Infantry Battalion Soldier (Camo uniform, tactical plate carrier, Kevlar helmet, NVGs, Assault Rifle)
                const walkCycle = Math.sin(ent.walkPhase);
                const legSwing1 = walkCycle * 0.20;
                const legSwing2 = -walkCycle * 0.20;

                // Combat boots & camo trousers
                addPart(px, py, pz, yaw, -0.13, 0.42, legSwing1, 0.16, 0.82, 0.19, ent.color);
                addPart(px, py, pz, yaw, 0.13, 0.42, legSwing2, 0.16, 0.82, 0.19, ent.color);

                // Camo combat torso + Plate Carrier Armored Vest
                addPart(px, py, pz, yaw, 0, 1.15, 0, 0.44, 0.66, 0.26, ent.color);
                addPart(px, py, pz, yaw, 0, 1.16, 0.02, 0.40, 0.48, 0.30, [0.16, 0.19, 0.15, 1.0]);

                // Tactical Rucksack / Backpack
                addPart(px, py, pz, yaw, 0, 1.18, -0.20, 0.34, 0.46, 0.18, [0.20, 0.23, 0.18, 1.0]);

                // Arms positioned holding rifle at tactical ready
                addPart(px, py, pz, yaw, -0.27, 1.12, 0.10, 0.13, 0.52, 0.16, ent.color);
                addPart(px, py, pz, yaw, 0.25, 1.12, 0.18, 0.13, 0.50, 0.22, ent.color);

                // M4 / Carbine Assault Rifle (Receiver + Barrel + Magazine)
                addPart(px, py, pz, yaw, 0.12, 1.08, 0.36, 0.08, 0.12, 0.68, [0.10, 0.11, 0.12, 1.0]);
                addPart(px, py, pz, yaw, 0.12, 0.96, 0.32, 0.06, 0.18, 0.09, [0.14, 0.14, 0.14, 1.0]);

                // Head + Ballistic Kevlar Helmet + Night-Vision Goggles (NVG)
                addPart(px, py, pz, yaw, 0, 1.62, 0, 0.23, 0.24, 0.23, [0.85, 0.66, 0.50, 1.0]);
                addPart(px, py, pz, yaw, 0, 1.74, -0.01, 0.30, 0.18, 0.32, ent.color);
                addPart(px, py, pz, yaw, 0, 1.68, 0.15, 0.20, 0.08, 0.08, [0.15, 0.95, 0.45, 1.0], 0.9); // Glowing NVG optics
            } else if (ent.type === 'ROVER') {
                // Autonomous Patrol Rover
                addPart(px, py, pz, yaw, 0, 0.4, 0, 1.6, 0.5, 2.6, [0.2, 0.25, 0.3, 1.0]);
                addPart(px, py, pz, yaw, 0, 0.85, -0.2, 1.2, 0.5, 1.4, ent.color);
                addPart(px, py, pz, yaw, 0, 0.88, 0.4, 1.1, 0.35, 0.2, [0.1, 0.35, 0.5, 0.85]);
                // 4 Wheels
                addPart(px, py, pz, yaw, -0.85, 0.3, 0.8, 0.28, 0.58, 0.58, [0.1, 0.1, 0.1, 1.0]);
                addPart(px, py, pz, yaw, 0.85, 0.3, 0.8, 0.28, 0.58, 0.58, [0.1, 0.1, 0.1, 1.0]);
                addPart(px, py, pz, yaw, -0.85, 0.3, -0.8, 0.28, 0.58, 0.58, [0.1, 0.1, 0.1, 1.0]);
                addPart(px, py, pz, yaw, 0.85, 0.3, -0.8, 0.28, 0.58, 0.58, [0.1, 0.1, 0.1, 1.0]);

                // Flashing Amber Roof Strobe
                const flash = Math.sin(timeSec * 12.0) > 0 ? 1.0 : 0.2;
                addPart(px, py, pz, yaw, 0, 1.2, -0.2, 0.3, 0.2, 0.3, [1.0, 0.65, 0.1, 1.0], flash);
            } else if (ent.type === 'TANK') {
                // Heavy Main Battle Tank (M1A2 Abrams / T-90M / Leopard 2A7)
                const turretYaw = ent.turretYawDeg ?? yaw;
                const darkSteel: [number, number, number, number] = [0.13, 0.14, 0.15, 1.0];
                const gunMetal: [number, number, number, number] = [0.18, 0.20, 0.22, 1.0];
                const accentArmor: [number, number, number, number] = [
                    Math.min(1.0, ent.color[0] * 1.15),
                    Math.min(1.0, ent.color[1] * 1.15),
                    Math.min(1.0, ent.color[2] * 1.15),
                    1.0
                ];

                // 1. Left & Right Continuous Armored Treads
                addPart(px, py, pz, yaw, -1.42, 0.46, 0, 0.66, 0.88, 5.5, darkSteel);
                addPart(px, py, pz, yaw, 1.42, 0.46, 0, 0.66, 0.88, 5.5, darkSteel);

                // Side Ballistic Skirts / Reactive Armor
                addPart(px, py, pz, yaw, -1.52, 0.72, 0, 0.16, 0.46, 5.2, accentArmor);
                addPart(px, py, pz, yaw, 1.52, 0.72, 0, 0.16, 0.46, 5.2, accentArmor);

                // 2. Main Armored Hull & Sloped Front Glacis
                addPart(px, py, pz, yaw, 0, 0.80, 0, 2.35, 0.82, 5.2, ent.color);
                addPart(px, py, pz, yaw, 0, 0.94, 2.25, 2.25, 0.46, 0.95, accentArmor);
                // Rear Engine Deck Grille
                addPart(px, py, pz, yaw, 0, 1.02, -1.95, 2.0, 0.36, 1.25, gunMetal);

                // 3. Rotating Tank Turret & Bustle Rack
                addPart(px, py, pz, turretYaw, 0, 1.54, -0.15, 2.15, 0.74, 2.75, ent.color);
                addPart(px, py, pz, turretYaw, 0, 1.58, -1.72, 1.82, 0.56, 0.85, accentArmor);
                // Gun Mantlet
                addPart(px, py, pz, turretYaw, 0, 1.54, 1.35, 0.85, 0.52, 0.55, gunMetal);

                // 4. 120mm Smoothbore Main Cannon Barrel + Bore Evacuator + Muzzle Brake
                addPart(px, py, pz, turretYaw, 0, 1.56, 3.05, 0.22, 0.22, 3.4, gunMetal);
                addPart(px, py, pz, turretYaw, 0, 1.56, 2.55, 0.34, 0.34, 0.68, accentArmor);
                addPart(px, py, pz, turretYaw, 0, 1.56, 4.72, 0.30, 0.30, 0.28, darkSteel);

                // 5. Commander Cupola, Heavy .50 Cal Roof MG & Tactical Strobe
                addPart(px, py, pz, turretYaw, 0.55, 2.02, -0.25, 0.62, 0.30, 0.62, accentArmor);
                addPart(px, py, pz, turretYaw, 0.55, 2.24, 0.20, 0.12, 0.14, 0.95, darkSteel);
                const tankStrobe = Math.sin(timeSec * 8.0 + px) > 0 ? 1.0 : 0.2;
                addPart(px, py, pz, turretYaw, -0.68, 2.02, -1.35, 0.22, 0.20, 0.22, [1.0, 0.3, 0.05, 1.0], tankStrobe);
            } else if (ent.type === 'MISSILE_TRUCK') {
                // Mobile SAM Launcher / Armored Missile Carrier Truck
                const turretYaw = ent.turretYawDeg ?? yaw;
                const darkWheel: [number, number, number, number] = [0.11, 0.12, 0.13, 1.0];

                // 6x6 Chassis Frame & Armored Cab
                addPart(px, py, pz, yaw, 0, 0.65, 0, 2.15, 0.55, 5.4, [0.18, 0.20, 0.22, 1.0]);
                addPart(px, py, pz, yaw, 0, 1.35, 1.65, 2.10, 1.05, 1.8, ent.color);
                addPart(px, py, pz, yaw, 0, 1.48, 2.56, 1.80, 0.40, 0.12, [0.12, 0.38, 0.52, 1.0]);

                // 6 Heavy Off-Road Wheels (3 axles)
                for (const axleZ of [1.7, 0.0, -1.7]) {
                    addPart(px, py, pz, yaw, -1.14, 0.45, axleZ, 0.36, 0.88, 0.88, darkWheel);
                    addPart(px, py, pz, yaw, 1.14, 0.45, axleZ, 0.36, 0.88, 0.88, darkWheel);
                }

                // Rotating Quad-SAM Missile Pod & Spinning Phased-Array Radar
                addPart(px, py, pz, turretYaw, 0, 1.22, -0.95, 1.45, 0.62, 1.45, ent.color);
                addPart(px, py, pz, turretYaw, 0, 1.92, -0.95, 1.72, 0.92, 2.45, ent.color);
                // Red Armed Missile Warhead Caps
                addPart(px, py, pz, turretYaw, -0.45, 2.02, 0.32, 0.38, 0.38, 0.16, [0.95, 0.2, 0.15, 1.0], 0.8);
                addPart(px, py, pz, turretYaw, 0.45, 2.02, 0.32, 0.38, 0.38, 0.16, [0.95, 0.2, 0.15, 1.0], 0.8);
                // Spinning Radar Dish
                addPart(px, py, pz, turretYaw, 0, 2.58, -1.45, 1.25, 0.34, 0.20, [0.82, 0.86, 0.82, 1.0], 0.0, timeSec * 200.0);
            } else if (ent.type === 'ATTACK_HELI') {
                // Tactical Attack Helicopter Gunship (AH-64 Apache / Ka-52)
                const darkMetal: [number, number, number, number] = [0.14, 0.15, 0.16, 1.0];

                // Main Armored Fuselage & Stepped Tandem Cockpit
                addPart(px, py, pz, yaw, 0, 0, 0, 1.38, 1.22, 4.8, ent.color);
                addPart(px, py, pz, yaw, 0, 0.44, 0.85, 1.12, 0.65, 2.2, [0.12, 0.35, 0.48, 1.0]);

                // Nose FLIR Sensor & 30mm Chain Gun
                addPart(px, py, pz, yaw, 0, -0.25, 2.55, 0.55, 0.45, 0.62, darkMetal);
                addPart(px, py, pz, yaw, 0, -0.48, 2.65, 0.14, 0.14, 1.25, darkMetal);

                // Stub Wings & Under-Wing Rocket/Hellfire Pods
                addPart(px, py, pz, yaw, 0, 0.05, 0.1, 4.2, 0.20, 0.92, ent.color);
                addPart(px, py, pz, yaw, -1.62, -0.24, 0.2, 0.44, 0.44, 1.65, darkMetal);
                addPart(px, py, pz, yaw, 1.62, -0.24, 0.2, 0.44, 0.44, 1.65, darkMetal);

                // Landing Skids
                addPart(px, py, pz, yaw, -0.82, -0.80, 0.1, 0.14, 0.14, 3.2, darkMetal);
                addPart(px, py, pz, yaw, 0.82, -0.80, 0.1, 0.14, 0.14, 3.2, darkMetal);

                // Tail Boom & Vertical Stabilizer Fin
                addPart(px, py, pz, yaw, 0, 0.14, -3.7, 0.52, 0.55, 3.5, ent.color);
                addPart(px, py, pz, yaw, 0, 0.82, -5.2, 0.22, 1.32, 0.85, ent.color);

                // High-Speed Spinning 4-Blade Main Rotor
                const rotorAngle = (timeSec * 760.0) % 360.0;
                addPart(px, py, pz, yaw, 0, 0.82, 0.1, 0.45, 0.35, 0.45, darkMetal);
                addPart(px, py, pz, yaw, 0, 0.96, 0.1, 7.8, 0.07, 0.36, darkMetal, 0.0, rotorAngle);
                addPart(px, py, pz, yaw, 0, 0.96, 0.1, 0.36, 0.07, 7.8, darkMetal, 0.0, rotorAngle);

                // Navigation Strobe Lights (Port Red / Starboard Green)
                addPart(px, py, pz, yaw, -2.12, 0.08, 0.1, 0.22, 0.22, 0.22, [1.0, 0.15, 0.15, 1.0], 1.0);
                addPart(px, py, pz, yaw, 2.12, 0.08, 0.1, 0.22, 0.22, 0.22, [0.15, 1.0, 0.35, 1.0], 1.0);
            } else if (ent.type === 'FIGHTER_JET') {
                // Supersonic Stealth Strike Fighter (F-22 Raptor / Su-57 Felon)
                // Main Stealth Fuselage & Radar Nose Cone
                addPart(px, py, pz, yaw, 0, 0, 0, 1.85, 0.70, 6.2, ent.color);
                addPart(px, py, pz, yaw, 0, -0.04, 3.9, 0.92, 0.46, 2.1, [0.22, 0.25, 0.29, 1.0]);

                // Gold-Tinted Bubble Cockpit Canopy
                addPart(px, py, pz, yaw, 0, 0.46, 1.60, 0.90, 0.45, 2.15, [0.78, 0.60, 0.18, 1.0]);

                // Swept Delta Main Wings & Forward Strakes
                addPart(px, py, pz, yaw, 0, -0.02, -0.45, 6.8, 0.16, 2.55, ent.color);
                addPart(px, py, pz, yaw, 0, 0.02, 1.15, 3.5, 0.14, 1.6, ent.color);

                // Wingtip Air-to-Air Missiles
                addPart(px, py, pz, yaw, -3.45, -0.06, -0.40, 0.18, 0.18, 1.95, [0.90, 0.92, 0.95, 1.0]);
                addPart(px, py, pz, yaw, 3.45, -0.06, -0.40, 0.18, 0.18, 1.95, [0.90, 0.92, 0.95, 1.0]);

                // Twin Canted Vertical Stabilizers & Horizontal Elevators
                addPart(px, py, pz, yaw, -0.85, 0.72, -2.45, 0.18, 1.25, 1.45, ent.color);
                addPart(px, py, pz, yaw, 0.85, 0.72, -2.45, 0.18, 1.25, 1.45, ent.color);
                addPart(px, py, pz, yaw, 0, -0.04, -2.75, 3.8, 0.14, 1.15, ent.color);

                // Twin Glowing Afterburner Jet Nozzles
                const burnerPulse = 0.85 + 0.3 * Math.sin(timeSec * 30.0);
                addPart(px, py, pz, yaw, -0.48, 0, -3.45, 0.46, 0.40, 1.15 * burnerPulse, [1.0, 0.52, 0.10, 1.0], 1.0);
                addPart(px, py, pz, yaw, 0.48, 0, -3.45, 0.46, 0.40, 1.15 * burnerPulse, [1.0, 0.52, 0.10, 1.0], 1.0);
            } else if (ent.type === 'TARGET_DRONE') {
                // Aerial Target Drone: Cross-frame with glowing red target rings
                addPart(px, py, pz, yaw, 0, 0, 0, 1.4, 0.12, 0.18, [0.15, 0.15, 0.15, 1.0]);
                addPart(px, py, pz, yaw, 0, 0, 0, 0.18, 0.12, 1.4, [0.15, 0.15, 0.15, 1.0]);
                // Center Glowing Core
                addPart(px, py, pz, yaw, 0, 0, 0, 0.4, 0.3, 0.4, ent.color, 1.0);
                // Propeller pods
                addPart(px, py, pz, yaw, -0.65, 0.05, 0, 0.3, 0.04, 0.3, [0.8, 0.1, 0.1, 1.0], 0.7);
                addPart(px, py, pz, yaw, 0.65, 0.05, 0, 0.3, 0.04, 0.3, [0.8, 0.1, 0.1, 1.0], 0.7);
                addPart(px, py, pz, yaw, 0, 0.05, -0.65, 0.3, 0.04, 0.3, [0.8, 0.1, 0.1, 1.0], 0.7);
                addPart(px, py, pz, yaw, 0, 0.05, 0.65, 0.3, 0.04, 0.3, [0.8, 0.1, 0.1, 1.0], 0.7);
            }
        }

        // 2. Render Projectiles (Glowing Plasma Laser Bolts)
        for (const proj of weaponSystem.projectiles) {
            const vx = proj.vel[0], vy = proj.vel[1], vz = proj.vel[2];
            const vLen = Math.hypot(vx, vy, vz) || 1;
            const normV = [vx / vLen, vy / vLen, vz / vLen];

            // Draw elongated laser bolt along velocity vector
            const boltLen = proj.isRailgun ? 3.6 : 1.8;
            const thickness = proj.isRailgun ? 0.22 : 0.12;
            const p0x = proj.pos[0] - normV[0] * boltLen;
            const p0y = proj.pos[1] - normV[1] * boltLen;
            const p0z = proj.pos[2] - normV[2] * boltLen;

            addBox(
                (proj.pos[0] + p0x) * 0.5,
                (proj.pos[1] + p0y) * 0.5,
                (proj.pos[2] + p0z) * 0.5,
                thickness, thickness, boltLen,
                Math.atan2(normV[0], normV[2]) * (180 / Math.PI),
                proj.color,
                1.0 // Emissive neon plasma glow
            );
        }

        // 3. Render Impact Particles (Sparks & Explosions)
        for (const part of weaponSystem.particles) {
            addBox(part.pos[0], part.pos[1], part.pos[2], 0.18, 0.18, 0.18, 0, part.color, 1.0);
        }

        const vertCount = vOffset / 12;
        if (vertCount === 0) return;

        // Write vertices to GPU buffer
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
