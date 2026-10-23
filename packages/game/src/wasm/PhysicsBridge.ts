export interface SensorOutput {
    accel: [number, number, number];
    gyro: [number, number, number];
    altitudeAMSL: number;
    altitudeAGL: number;
    batteryPct: number;
    rangefinder: number;
    latitude: number;
    longitude: number;
}

interface EmscriptenModule {
    HEAPF32?: Float32Array;
    HEAPF64?: Float64Array;
    setValue(ptr: number, value: number, type: 'i8' | 'float'): void;
    getValue(ptr: number, type: 'float' | 'double'): number;
    _malloc(size: number): number;
    _physics_init(x: number, y: number, z: number): void;
    _physics_arm(armed: number): void;
    _physics_set_ground_offset(offset: number): void;
    _physics_is_armed(): number;
    _physics_step(dt: number): void;
    _physics_get_position(ptr: number): void;
    _physics_get_rotation(ptr: number): void;
    _physics_get_velocity(ptr: number): void;
    _physics_get_motor_rpms(ptr: number): void;
    _fc_set_mode(mode: number): void;
    _fc_get_mode(): number;
    _fc_set_manual_input(throttle: number, pitch: number, roll: number, yaw: number): void;
    _fc_set_target(x: number, y: number, z: number, heading: number): void;
    _collision_load_heightmap(ptr: number, width: number, height: number, sx: number, sy: number, sz: number): void;
    _sensors_get_data(floatPtr: number, doublePtr: number): void;
}

declare global {
    interface Window {
        createPhysicsModule?: (options: { locateFile: (path: string) => string }) => Promise<EmscriptenModule>;
    }
}

export class PhysicsBridge {
    private module?: EmscriptenModule;
    private floatBufferPtr: number = 0;
    private doubleBufferPtr: number = 0;

    public async init(): Promise<boolean> {
        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = '/assets/physics.js';
            script.onload = async () => {
                try {
                    const factory = window.createPhysicsModule;
                    if (!factory) {
                        throw new Error("createPhysicsModule not found on window");
                    }

                    const module = await factory({
                        locateFile: (path: string) => `/assets/${path}`,
                    });
                    this.module = module;

                    // Allocate memory for data reading
                    this.floatBufferPtr = module._malloc(16 * 4); // 16 floats
                    this.doubleBufferPtr = module._malloc(4 * 8); // 4 doubles

                    module._physics_init(0, 10, 0);
                    console.log("C++ WebAssembly Physics Engine initialized successfully.");
                    resolve(true);
                } catch (e) {
                    console.error("Failed to load C++ Physics WASM module:", e);
                    resolve(false);
                }
            };
            script.onerror = () => {
                console.error("Failed to load /assets/physics.js");
                resolve(false);
            };
            document.body.appendChild(script);
        });
    }

    public arm(armed: boolean): void {
        if (!this.module) return;
        this.module._physics_arm(armed ? 1 : 0);
    }

    public setGroundOffset(offset: number): void {
        if (!this.module) return;
        this.module._physics_set_ground_offset(offset);
    }

    public loadHeightmap(data: Uint16Array, width: number, height: number, sx: number, sy: number, sz: number): void {
        if (!this.module) return;
        const nBytes = data.byteLength;
        const ptr = this.module._malloc(nBytes);
        // Write uint16 data safely into WebAssembly memory
        const u8View = new Uint8Array(data.buffer, data.byteOffset, nBytes);
        for (let i = 0; i < nBytes; i++) {
            this.module.setValue(ptr + i, u8View[i], 'i8');
        }
        this.module._collision_load_heightmap(ptr, width, height, sx, sy, sz);
        console.log(`[PhysicsBridge] Loaded terrain collision heightmap: ${width}x${height}, scale=[${sx}, ${sy}, ${sz}]`);
    }

    public clearHeightmap(): void {
        if (!this.module) return;
        this.module._collision_load_heightmap(0, 0, 0, 0, 0, 0);
    }

    public resetPosition(x: number, y: number, z: number): void {
        if (!this.module) return;
        this.module._physics_init(x, y, z);
        this.module._physics_arm(1);
    }

    public setPosition(x: number, y: number, z: number): void {
        if (!this.module) return;
        // g_physics.position is at byte offset 4232 in WASM memory
        this.module.setValue(4232, x, 'float');
        this.module.setValue(4236, y, 'float');
        this.module.setValue(4240, z, 'float');
    }

    public setVelocity(vx: number, vy: number, vz: number): void {
        if (!this.module) return;
        // g_physics.velocity is at byte offset 4244 in WASM memory
        this.module.setValue(4244, vx, 'float');
        this.module.setValue(4248, vy, 'float');
        this.module.setValue(4252, vz, 'float');
    }

    public setRotation(roll: number, pitch: number, yaw: number): void {
        if (!this.module) return;
        // g_physics.rotation (roll, pitch, yaw in deg) is at byte offset 4256 in WASM memory
        this.module.setValue(4256, roll, 'float');
        this.module.setValue(4260, pitch, 'float');
        this.module.setValue(4264, yaw, 'float');
    }

    public isArmed(): boolean {
        if (!this.module) return false;
        return this.module._physics_is_armed() === 1;
    }

    public setMode(mode: 'MANUAL' | 'AUTOPILOT'): void {
        if (!this.module) return;
        this.module._fc_set_mode(mode === 'MANUAL' ? 0 : 1);
    }

    public getMode(): 'MANUAL' | 'AUTOPILOT' {
        if (!this.module) return 'MANUAL';
        return this.module._fc_get_mode() === 0 ? 'MANUAL' : 'AUTOPILOT';
    }

    public setManualInput(throttle: number, pitch: number, roll: number, yaw: number): void {
        if (!this.module) return;
        this.module._fc_set_manual_input(throttle, pitch, roll, yaw);
    }

    public setAutopilotTarget(x: number, y: number, z: number, heading: number = 0): void {
        if (!this.module) return;
        this.module._fc_set_target(x, y, z, heading);
    }

    public step(dt: number): void {
        if (!this.module) return;
        this.module._physics_step(dt);
    }

    private getFloat(offsetFloats: number): number {
        if (!this.module) return 0;
        if (this.module.HEAPF32) {
            return this.module.HEAPF32[(this.floatBufferPtr >> 2) + offsetFloats];
        }
        return this.module.getValue(this.floatBufferPtr + offsetFloats * 4, 'float');
    }

    private getDouble(offsetDoubles: number): number {
        if (!this.module) return 0;
        if (this.module.HEAPF64) {
            return this.module.HEAPF64[(this.doubleBufferPtr >> 3) + offsetDoubles];
        }
        return this.module.getValue(this.doubleBufferPtr + offsetDoubles * 8, 'double');
    }

    public getPosition(): [number, number, number] {
        if (!this.module) return [0, 0, 0];
        this.module._physics_get_position(this.floatBufferPtr);
        return [this.getFloat(0), this.getFloat(1), this.getFloat(2)];
    }

    public getRotation(): [number, number, number] {
        if (!this.module) return [0, 0, 0];
        this.module._physics_get_rotation(this.floatBufferPtr);
        return [this.getFloat(0), this.getFloat(1), this.getFloat(2)]; // roll, pitch, yaw (deg)
    }

    public getVelocity(): [number, number, number] {
        if (!this.module) return [0, 0, 0];
        this.module._physics_get_velocity(this.floatBufferPtr);
        return [this.getFloat(0), this.getFloat(1), this.getFloat(2)];
    }

    public getMotorRPMs(): [number, number, number, number] {
        if (!this.module) return [0, 0, 0, 0];
        this.module._physics_get_motor_rpms(this.floatBufferPtr);
        return [this.getFloat(0), this.getFloat(1), this.getFloat(2), this.getFloat(3)];
    }

    public getSensors(): SensorOutput {
        if (!this.module) {
            return {
                accel: [0, 0, 0], gyro: [0, 0, 0], altitudeAMSL: 0,
                altitudeAGL: 0, batteryPct: 100, rangefinder: 0,
                latitude: 33.6, longitude: 72.9
            };
        }

        this.module._sensors_get_data(this.floatBufferPtr, this.doubleBufferPtr);

        return {
            accel: [this.getFloat(0), this.getFloat(1), this.getFloat(2)],
            gyro: [this.getFloat(3), this.getFloat(4), this.getFloat(5)],
            altitudeAMSL: this.getFloat(6),
            altitudeAGL: this.getFloat(7),
            batteryPct: this.getFloat(8),
            rangefinder: this.getFloat(9),
            latitude: this.getDouble(0),
            longitude: this.getDouble(1),
        };
    }
}
