import { DronePhysicsState } from './DronePhysics';
import { InputManager } from '../core/InputManager';
import { DRONE, FlightMode, Vec3 } from 'drone-autonomy-shared';

class PIDController {
    private kp: number;
    private ki: number;
    private kd: number;
    private integral: number = 0;
    private prevError: number = 0;
    private maxIntegral: number;

    constructor(kp: number, ki: number, kd: number, maxIntegral: number = 100) {
        this.kp = kp;
        this.ki = ki;
        this.kd = kd;
        this.maxIntegral = maxIntegral;
    }

    public update(error: number, dt: number): number {
        this.integral += error * dt;
        // Anti-windup
        this.integral = Math.max(-this.maxIntegral, Math.min(this.maxIntegral, this.integral));
        
        const derivative = (error - this.prevError) / dt;
        this.prevError = error;

        return this.kp * error + this.ki * this.integral + this.kd * derivative;
    }
}

export class FlightController {
    private mode: FlightMode = FlightMode.MANUAL;
    private targetPosition: Vec3 | null = null;
    private targetHeading: number | null = null;

    // Angle PIDs
    private pitchPID = new PIDController(2.0, 0.0, 0.5);
    private rollPID = new PIDController(2.0, 0.0, 0.5);
    private yawPID = new PIDController(3.0, 0.1, 0.2);

    // Rate PIDs
    private pitchRatePID = new PIDController(0.5, 0.0, 0.01);
    private rollRatePID = new PIDController(0.5, 0.0, 0.01);
    private yawRatePID = new PIDController(0.5, 0.0, 0.01);

    // Autopilot PIDs
    private altPID = new PIDController(1.5, 0.1, 0.8);
    private posXPID = new PIDController(0.5, 0.0, 0.2);
    private posZPID = new PIDController(0.5, 0.0, 0.2);

    public setMode(mode: FlightMode): void {
        this.mode = mode;
    }

    public getMode(): FlightMode {
        return this.mode;
    }

    public setTarget(position: Vec3, heading?: number): void {
        this.targetPosition = position;
        if (heading !== undefined) this.targetHeading = heading;
    }

    public update(dt: number, input: InputManager, state: DronePhysicsState, isArmed: boolean): number[] {
        if (!isArmed) {
            return [0, 0, 0, 0];
        }

        let targetPitch = 0;
        let targetRoll = 0;
        let targetYawRate = 0;
        let baseThrottle = 0;

        const maxTilt = 30; // degrees
        const maxYawRate = 60; // degrees/sec

        // Hover thrust approx
        const hoverThrust = (DRONE.mass * 9.81) / 4;
        const hoverRPM = Math.sqrt(hoverThrust / DRONE.thrustCoeff);
        
        if (this.mode === FlightMode.MANUAL) {
            targetPitch = input.pitch * maxTilt;
            targetRoll = input.roll * maxTilt;
            targetYawRate = input.yaw * maxYawRate;
            
            // Map throttle input (-1 to 1) to RPM
            baseThrottle = hoverRPM + (input.throttle * hoverRPM * 0.5); 
        } else if (this.mode === FlightMode.AUTOPILOT && this.targetPosition) {
            // Autopilot logic
            const altError = this.targetPosition.y - state.position.y;
            const altCorrection = this.altPID.update(altError, dt);
            baseThrottle = hoverRPM + altCorrection * 500;

            const xError = this.targetPosition.x - state.position.x;
            const zError = this.targetPosition.z - state.position.z;
            
            // World to local error
            const yawRad = state.rotation.y * Math.PI / 180;
            const localXError = xError * Math.cos(yawRad) + zError * Math.sin(yawRad);
            const localZError = -xError * Math.sin(yawRad) + zError * Math.cos(yawRad);

            targetPitch = this.posZPID.update(localZError, dt) * maxTilt;
            targetRoll = this.posXPID.update(localXError, dt) * maxTilt;

            // Clamp targets
            targetPitch = Math.max(-maxTilt, Math.min(maxTilt, targetPitch));
            targetRoll = Math.max(-maxTilt, Math.min(maxTilt, targetRoll));

            if (this.targetHeading !== null) {
                let headingError = this.targetHeading - state.rotation.y;
                // Normalize to -180, 180
                while (headingError > 180) headingError -= 360;
                while (headingError < -180) headingError += 360;
                targetYawRate = this.yawPID.update(headingError, dt);
            } else {
                targetYawRate = 0;
            }
        }

        // Angle Controller
        const pitchError = targetPitch - state.rotation.x;
        const rollError = targetRoll - state.rotation.z;
        
        const targetPitchRate = this.pitchPID.update(pitchError, dt);
        const targetRollRate = this.rollPID.update(rollError, dt);

        // Rate Controller
        const pitchRateError = targetPitchRate - state.angularVelocity.x;
        const rollRateError = targetRollRate - state.angularVelocity.z;
        const yawRateError = targetYawRate - state.angularVelocity.y;

        const pitchCorr = this.pitchRatePID.update(pitchRateError, dt) * 500;
        const rollCorr = this.rollRatePID.update(rollRateError, dt) * 500;
        const yawCorr = this.yawRatePID.update(yawRateError, dt) * 500;

        // Mixer
        let m1 = baseThrottle + pitchCorr + rollCorr - yawCorr; // FL
        let m2 = baseThrottle + pitchCorr - rollCorr + yawCorr; // FR
        let m3 = baseThrottle - pitchCorr - rollCorr - yawCorr; // RR
        let m4 = baseThrottle - pitchCorr + rollCorr + yawCorr; // RL

        // Clamp to min/max RPM
        const clamp = (val: number) => Math.max(DRONE.minRPM, Math.min(DRONE.maxRPM, val));
        
        return [clamp(m1), clamp(m2), clamp(m3), clamp(m4)];
    }
}
