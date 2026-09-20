import { Vector3 } from '@babylonjs/core';
import { DronePhysicsState } from './DronePhysics';
import { Scene, Ray } from '@babylonjs/core';
import {
    IMUData, GPSData, BatteryData, Telemetry, WindData,
    DroneFlightState, FlightMode, GPSFixType, SensorStatus,
    DRONE, SIMULATION
} from 'drone-autonomy-shared';

const REF_LAT = 33.6;
const REF_LON = 72.9;

export class Sensors {
    private batteryPct: number = 100;
    private timeAccum: number = 0;

    private gaussianNoise(stdDev: number): number {
        // Box-Muller transform
        const u = Math.max(1e-10, Math.random());
        const v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * stdDev;
    }

    public generateIMU(state: DronePhysicsState, dt: number): IMUData {
        const safedt = Math.max(dt, 1e-5);
        return {
            acceleration: {
                x: state.velocity.x / safedt + this.gaussianNoise(SIMULATION.imu.noiseSigmaAccel),
                y: state.velocity.y / safedt + 9.81 + this.gaussianNoise(SIMULATION.imu.noiseSigmaAccel),
                z: state.velocity.z / safedt + this.gaussianNoise(SIMULATION.imu.noiseSigmaAccel),
            },
            angularRate: {
                x: state.angularVelocity.x + this.gaussianNoise(SIMULATION.imu.noiseSigmaGyro),
                y: state.angularVelocity.y + this.gaussianNoise(SIMULATION.imu.noiseSigmaGyro),
                z: state.angularVelocity.z + this.gaussianNoise(SIMULATION.imu.noiseSigmaGyro),
            },
        };
    }

    public generateGPS(state: DronePhysicsState): GPSData {
        const latDeg  = REF_LAT + (-state.position.z / 111320) + this.gaussianNoise(SIMULATION.gps.noiseMetersSigma / 111320);
        const lonDeg  = REF_LON + (state.position.x / (111320 * Math.cos(REF_LAT * Math.PI / 180))) + this.gaussianNoise(SIMULATION.gps.noiseMetersSigma / 111320);
        const altAMSL = state.position.y + this.gaussianNoise(SIMULATION.barometer.noiseSigmaMeters);

        return {
            fix: GPSFixType.FIX_3D,
            satellites: 12,
            hdop: 0.9,
            vdop: 1.2,
            position: {
                latitude: latDeg,
                longitude: lonDeg,
                altitude_amsl: altAMSL,
                altitude_agl: state.position.y, // rough — terrain is flat near origin
            },
        };
    }

    public generateBarometerAlt(state: DronePhysicsState): number {
        return state.position.y + this.gaussianNoise(SIMULATION.barometer.noiseSigmaMeters);
    }

    public generateRangefinder(scene: Scene, pos: Vector3): number {
        const ray = new Ray(pos, new Vector3(0, -1, 0), 100);
        const hit = scene.pickWithRay(ray);
        if (hit?.hit && hit.pickedPoint) return pos.y - hit.pickedPoint.y;
        return -1;
    }

    public generateBattery(dt: number, rpms: number[]): BatteryData {
        const totalPower = rpms.reduce((acc, r) => acc + DRONE.thrustCoeff * r * r, 0);
        const normalizedPower = totalPower / (DRONE.thrustCoeff * DRONE.maxRPM ** 2 * DRONE.motorCount);
        // Drain ~1% per minute at hover, faster at full throttle
        const drainPctPerSec = 0.0167 * (0.5 + normalizedPower);
        this.batteryPct = Math.max(0, this.batteryPct - drainPctPerSec * dt);

        const voltage = 22.4 * (0.6 + 0.4 * (this.batteryPct / 100));
        const current = normalizedPower * 30; // max ~30A at full throttle
        const remainingCapacityAh = (this.batteryPct / 100) * 5.0;
        const remainingTime = current > 0.1 ? (remainingCapacityAh / current) * 3600 : 3600;

        return {
            voltage,
            current,
            percentage: this.batteryPct,
            remainingTime,
            cellCount: 4, // 4S battery
            temperature: 25 + normalizedPower * 15,
        };
    }

    public generateWind(time: number): WindData {
        const gust = SIMULATION.wind.gustAmplitude * Math.sin(time * SIMULATION.wind.gustFrequency * 2 * Math.PI);
        return {
            speed: SIMULATION.wind.defaultSpeed + gust,
            direction: SIMULATION.wind.defaultDirection,
        };
    }

    public assembleTelemetry(
        state: DronePhysicsState,
        dt: number,
        rpms: number[],
        scene: Scene
    ): Telemetry {
        this.timeAccum += dt;
        const gps = this.generateGPS(state);
        const baro = this.generateBarometerAlt(state);
        const rfPos = new Vector3(state.position.x, state.position.y, state.position.z);

        const groundSpd = Math.sqrt(state.velocity.x ** 2 + state.velocity.z ** 2);

        return {
            timestamp: Date.now(),
            state: DroneFlightState.IDLE,       // overridden by DroneManager/server
            flightMode: FlightMode.MANUAL,      // overridden by DroneManager
            armed: false,                       // overridden by DroneManager
            position: gps.position,
            attitude: {
                roll: state.rotation.x,
                pitch: state.rotation.y,
                yaw: state.rotation.z,
                rollRate: state.angularVelocity.x * (180 / Math.PI),
                pitchRate: state.angularVelocity.y * (180 / Math.PI),
                yawRate: state.angularVelocity.z * (180 / Math.PI),
            },
            groundSpeed: groundSpd,
            verticalSpeed: state.velocity.y,
            heading: ((state.rotation.z % 360) + 360) % 360,
            battery: this.generateBattery(dt, rpms),
            gps,
            wind: this.generateWind(this.timeAccum),
            sensors: {
                imu: SensorStatus.HEALTHY,
                compass: SensorStatus.HEALTHY,
                barometer: SensorStatus.HEALTHY,
                gps: SensorStatus.HEALTHY,
                rangefinder: SensorStatus.HEALTHY,
                cameraForward: SensorStatus.HEALTHY,
                cameraDown: SensorStatus.NOT_PRESENT,
            },
            rangefinderAlt: this.generateRangefinder(scene, rfPos),
        };
    }
}
