import { Vector3, Matrix, Quaternion } from '@babylonjs/core';
import { DRONE, GRAVITY } from 'drone-autonomy-shared';

export interface DronePhysicsState {
    position: Vector3;
    velocity: Vector3;
    rotation: Vector3; // Euler angles in degrees
    angularVelocity: Vector3; // Degrees per second
}

export class DronePhysics {
    private state: DronePhysicsState;
    private motorRPMs: number[] = [0, 0, 0, 0];
    private windSpeed: number = 0;
    private windDirection: number = 0; // degrees
    private terrainHeightCallback: (x: number, z: number) => number = () => 0;

    constructor() {
        this.state = {
            position: new Vector3(0, 5, 0),
            velocity: new Vector3(0, 0, 0),
            rotation: new Vector3(0, 0, 0),
            angularVelocity: new Vector3(0, 0, 0)
        };
    }

    public setMotorRPMs(rpms: number[]): void {
        this.motorRPMs = rpms;
    }

    public setWind(speed: number, direction: number): void {
        this.windSpeed = speed;
        this.windDirection = direction;
    }

    public setTerrainHeightCallback(fn: (x: number, z: number) => number): void {
        this.terrainHeightCallback = fn;
    }

    public setPosition(x: number, y: number, z: number): void {
        this.state.position.set(x, y, z);
        this.state.velocity.setAll(0);
        this.state.angularVelocity.setAll(0);
    }

    public getState(): DronePhysicsState {
        return this.state;
    }

    public update(dt: number): void {
        if (dt <= 0) return;
        
        // Anti-NaN check
        if (isNaN(this.state.position.x)) this.resetState();

        const thrustPerMotor = this.motorRPMs.map(rpm => DRONE.thrustCoeff * rpm * rpm);
        const totalThrust = thrustPerMotor.reduce((a, b) => a + b, 0);

        // Convert rotation to radians for math
        const pitchRad = this.state.rotation.x * Math.PI / 180;
        const yawRad = this.state.rotation.y * Math.PI / 180;
        const rollRad = this.state.rotation.z * Math.PI / 180;

        const rotationQuat = Quaternion.RotationYawPitchRoll(yawRad, pitchRad, rollRad);
        const rotationMatrix = new Matrix();
        rotationQuat.toRotationMatrix(rotationMatrix);

        // Forces
        const thrustForceLocal = new Vector3(0, totalThrust, 0);
        const thrustForceWorld = Vector3.TransformCoordinates(thrustForceLocal, rotationMatrix);
        
        const gravityForce = new Vector3(0, -GRAVITY * DRONE.mass, 0);
        
        // Simple drag & wind
        const dragCoeff = 0.1;
        const dragForce = this.state.velocity.scale(-dragCoeff);
        
        // Sum forces
        const totalForce = thrustForceWorld.add(gravityForce).add(dragForce);
        
        // Linear physics
        const acceleration = totalForce.scale(1 / DRONE.mass);
        this.state.velocity.addInPlace(acceleration.scale(dt));
        this.state.position.addInPlace(this.state.velocity.scale(dt));

        // Torques (X configuration)
        // M1: Front-Left (CW), M2: Front-Right (CCW), M3: Rear-Right (CW), M4: Rear-Left (CCW)
        // Assuming armLength is distance from center to motor
        const L = DRONE.armLength / Math.sqrt(2); // arm projection on axis
        
        // Roll: Left motors push up, right motors push down
        const torqueX = (thrustPerMotor[0] + thrustPerMotor[3] - thrustPerMotor[1] - thrustPerMotor[2]) * L;
        // Pitch: Rear motors push up, front motors push down
        const torqueZ = (thrustPerMotor[2] + thrustPerMotor[3] - thrustPerMotor[0] - thrustPerMotor[1]) * L;
        // Yaw: reaction torque (CW vs CCW)
        const torqueY = (thrustPerMotor[0] + thrustPerMotor[2] - thrustPerMotor[1] - thrustPerMotor[3]) * 0.05; // 0.05 is approx yaw drag coeff

        const torque = new Vector3(torqueX, torqueY, torqueZ);
        
        // Angular physics
        // Simplified inertia tensor as scalar for now
        const inertia = DRONE.mass * (DRONE.armLength * DRONE.armLength) / 2;
        const angularAcceleration = torque.scale(1 / inertia);
        
        this.state.angularVelocity.addInPlace(angularAcceleration.scale(dt));
        
        // Apply damping to angular velocity to prevent infinite spinning
        this.state.angularVelocity.scaleInPlace(0.95);

        this.state.rotation.addInPlace(this.state.angularVelocity.scale(dt));

        // Ground collision
        const terrainHeight = this.terrainHeightCallback(this.state.position.x, this.state.position.z);
        if (this.state.position.y < terrainHeight + 0.15) {
            this.state.position.y = terrainHeight + 0.15;
            if (this.state.velocity.y < 0) this.state.velocity.y = 0;
            // Dampen rotation when on ground
            this.state.rotation.x *= 0.5;
            this.state.rotation.z *= 0.5;
            this.state.angularVelocity.set(0, 0, 0);
        }
    }

    private resetState(): void {
        this.state = {
            position: new Vector3(0, 5, 0),
            velocity: new Vector3(0, 0, 0),
            rotation: new Vector3(0, 0, 0),
            angularVelocity: new Vector3(0, 0, 0)
        };
    }
}
