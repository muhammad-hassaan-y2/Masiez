import { Scene } from '@babylonjs/core';
import { DroneMesh } from './DroneMesh';
import { DronePhysics } from './DronePhysics';
import { FlightController } from './FlightController';
import { Sensors } from './Sensors';
import { InputManager } from '../core/InputManager';
import { Telemetry, ServerToGameMsg, FlightMode, CommandType } from 'drone-autonomy-shared';

export class DroneManager {
    public mesh: DroneMesh;
    public physics: DronePhysics;
    private controller: FlightController;
    private sensors: Sensors;
    private scene: Scene;

    private armed: boolean = false;
    private lastTelemetry: Telemetry | null = null;

    constructor(scene: Scene, terrainHeightFn: (x: number, z: number) => number) {
        this.scene = scene;
        this.mesh = new DroneMesh(scene);
        this.physics = new DronePhysics();
        this.physics.setTerrainHeightCallback(terrainHeightFn);
        this.controller = new FlightController();
        this.sensors = new Sensors();

        // Start slightly above ground
        const groundY = terrainHeightFn(0, 0);
        this.physics.setPosition(0, groundY + 1, 0);
    }

    public update(dt: number, input: InputManager): void {
        // Get motor RPMs from controller
        const rpms = this.controller.update(dt, input, this.physics.getState(), this.armed);

        // Update physics
        this.physics.setMotorRPMs(rpms);
        this.physics.update(dt);

        const state = this.physics.getState();

        // Sync mesh to physics state
        const root = this.mesh.getRootNode();
        root.position.set(state.position.x, state.position.y, state.position.z);
        root.rotation.set(
            state.rotation.x * Math.PI / 180,
            state.rotation.y * Math.PI / 180,
            state.rotation.z * Math.PI / 180
        );

        this.mesh.updatePropellerSpin(rpms);

        // Generate telemetry
        this.lastTelemetry = this.sensors.assembleTelemetry(state, dt, rpms, this.scene);
        this.lastTelemetry.armed = this.armed;
        this.lastTelemetry.flightMode = this.controller.getMode();
    }

    public arm(): void {
        this.armed = true;
        this.mesh.setArmedVisual(true);
    }

    public disarm(): void {
        this.armed = false;
        this.mesh.setArmedVisual(false);
        this.physics.setMotorRPMs([0, 0, 0, 0]);
    }

    public toggleArm(): void {
        if (this.armed) this.disarm(); else this.arm();
    }

    public toggleMode(): void {
        const next = this.controller.getMode() === FlightMode.MANUAL
            ? FlightMode.AUTOPILOT
            : FlightMode.MANUAL;
        this.controller.setMode(next);
    }

    public getTelemetry(): Telemetry | null {
        return this.lastTelemetry;
    }

    public getPhysicsState() {
        return this.physics.getState();
    }

    public isArmed(): boolean {
        return this.armed;
    }

    public getFlightMode(): FlightMode {
        return this.controller.getMode();
    }

    /** Handle commands received from the server */
    public executeCommand(msg: ServerToGameMsg): void {
        if (msg.type !== 'server:command') return;
        const cmd = msg.command;

        switch (cmd.type) {
            case CommandType.ARM_AND_TAKEOFF: {
                this.arm();
                this.controller.setMode(FlightMode.AUTOPILOT);
                const pos = this.physics.getState().position;
                const alt = (cmd.params as { altitude: number }).altitude ?? 15;
                this.controller.setTarget({ x: pos.x, y: pos.y + alt, z: pos.z });
                break;
            }
            case CommandType.LAND: {
                this.controller.setMode(FlightMode.AUTOPILOT);
                const pos = this.physics.getState().position;
                this.controller.setTarget({ x: pos.x, y: 0, z: pos.z });
                break;
            }
            case CommandType.GOTO_LOCATION: {
                this.controller.setMode(FlightMode.AUTOPILOT);
                const p = cmd.params as { latitude: number; longitude: number; altitude_amsl: number };
                // Simple: treat lat/lon delta from origin as meters
                const REF_LAT = 33.6; const REF_LON = 72.9;
                const x = (p.longitude - REF_LON) * 111320 * Math.cos(REF_LAT * Math.PI / 180);
                const z = -(p.latitude - REF_LAT) * 111320;
                this.controller.setTarget({ x, y: p.altitude_amsl, z });
                break;
            }
            case CommandType.SET_FLIGHT_MODE: {
                const p = cmd.params as { mode: FlightMode };
                this.controller.setMode(p.mode);
                break;
            }
            case CommandType.EMERGENCY_STOP:
            case CommandType.EMERGENCY_LAND: {
                this.disarm();
                break;
            }
            case CommandType.RETURN_TO_LAUNCH: {
                this.controller.setMode(FlightMode.AUTOPILOT);
                this.controller.setTarget({ x: 0, y: 15, z: 0 });
                break;
            }
            case CommandType.SET_GIMBAL: {
                // Handled by CameraSystem
                break;
            }
        }
    }
}
