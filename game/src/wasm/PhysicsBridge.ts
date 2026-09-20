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

export class PhysicsBridge {
    private module: any = null;
    private floatBufferPtr: number = 0;
    private doubleBufferPtr: number = 0;

    public async init(): Promise<boolean> {
        return new Promise((resolve) => {
            // Load physics.js script
            const script = document.createElement('script');
            script.src = '/assets/physics.js';
            script.onload = async () => {
                try {
                    // @ts-ignore
                    this.module = await window.createPhysicsModule({
                        locateFile: (path: string) => `/assets/${path}`,
                    });

                    // Allocate memory for data reading
                    this.floatBufferPtr = this.module._malloc(16 * 4); // 16 floats
                    this.doubleBufferPtr = this.module._malloc(4 * 8); // 4 doubles

                    this.module._physics_init(0, 10, 0);
                    console.log("C++ WebAssembly Physics Engine initialized.");
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

    public getPosition(): [number, number, number] {
        if (!this.module) return [0, 0, 0];
        this.module._physics_get_position(this.floatBufferPtr);
        const heap = this.module.HEAPF32;
        const idx = this.floatBufferPtr >> 2;
        return [heap[idx], heap[idx + 1], heap[idx + 2]];
    }

    public getRotation(): [number, number, number] {
        if (!this.module) return [0, 0, 0];
        this.module._physics_get_rotation(this.floatBufferPtr);
        const heap = this.module.HEAPF32;
        const idx = this.floatBufferPtr >> 2;
        return [heap[idx], heap[idx + 1], heap[idx + 2]]; // roll, pitch, yaw (deg)
    }

    public getVelocity(): [number, number, number] {
        if (!this.module) return [0, 0, 0];
        this.module._physics_get_velocity(this.floatBufferPtr);
        const heap = this.module.HEAPF32;
        const idx = this.floatBufferPtr >> 2;
        return [heap[idx], heap[idx + 1], heap[idx + 2]];
    }

    public getMotorRPMs(): [number, number, number, number] {
        if (!this.module) return [0, 0, 0, 0];
        this.module._physics_get_motor_rpms(this.floatBufferPtr);
        const heap = this.module.HEAPF32;
        const idx = this.floatBufferPtr >> 2;
        return [heap[idx], heap[idx + 1], heap[idx + 2], heap[idx + 3]];
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
        const fHeap = this.module.HEAPF32;
        const dHeap = this.module.HEAPF64;
        const fIdx = this.floatBufferPtr >> 2;
        const dIdx = this.doubleBufferPtr >> 3;

        return {
            accel: [fHeap[fIdx], fHeap[fIdx + 1], fHeap[fIdx + 2]],
            gyro: [fHeap[fIdx + 3], fHeap[fIdx + 4], fHeap[fIdx + 5]],
            altitudeAMSL: fHeap[fIdx + 6],
            altitudeAGL: fHeap[fIdx + 7],
            batteryPct: fHeap[fIdx + 8],
            rangefinder: fHeap[fIdx + 9],
            latitude: dHeap[dIdx],
            longitude: dHeap[dIdx + 1],
        };
    }
}
