import { TankTarget } from '../gpu/TankRenderer';
import { terrainHeight } from './Terrain';

const ARRIVAL_DISTANCE = 2.0;
const APPROACH_RADIUS = 40.0;
const CRUISE_HEIGHT = 12.0;
const YAW_GAIN = 2.5;

export interface AutopilotSpeed {
    maxSpeed: number;
    brakeRate: number;
}

export type FollowerMode = 'world' | 'screen';

export interface AutopilotCommand {
    throttle: number;
    pitch: number;
    roll: number;
    yaw: number;
    tankIndex: number;
    reached: boolean;
}

function normalizeAngle(angle: number): number {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export class Autopilot {
    private targetIndex = -1;

    public get isActive(): boolean {
        return this.targetIndex >= 0;
    }

    public get activeIndex(): number {
        return this.targetIndex;
    }

    public setTarget(index: number): void {
        this.targetIndex = index;
    }

    public cancel(): void {
        this.targetIndex = -1;
    }

    public update(
        pos: [number, number, number],
        headingRad: number,
        targets: TankTarget[],
        speed: AutopilotSpeed,
    ): AutopilotCommand | undefined {
        if (this.targetIndex < 0) return undefined;

        const target = targets.find((candidate) => candidate.index === this.targetIndex);
        if (!target) {
            this.targetIndex = -1;
            return undefined;
        }

        const dx = target.center[0] - pos[0];
        const dz = target.center[2] - pos[2];
        const horizontal = Math.hypot(dx, dz);
        const headingError = normalizeAngle(Math.atan2(-dx, dz) - headingRad);
        const alignment = Math.max(0, Math.cos(headingError));
        const approachSpeed = Math.min(speed.maxSpeed, Math.sqrt(2 * speed.brakeRate * horizontal));
        const approachBlend = Math.min(1, horizontal / APPROACH_RADIUS);
        const terrainFloor = terrainHeight(pos[0], pos[2]) + 1.2;
        const cruiseY = Math.max(terrainFloor, target.center[1] + CRUISE_HEIGHT * approachBlend);
        const reached = horizontal <= ARRIVAL_DISTANCE;

        const command: AutopilotCommand = {
            throttle: Math.max(-0.7, Math.min(1, (cruiseY - pos[1]) * 0.25)),
            pitch: (approachSpeed / speed.maxSpeed) * alignment * alignment,
            roll: 0,
            yaw: Math.max(-1, Math.min(1, headingError * YAW_GAIN)),
            tankIndex: target.index,
            reached,
        };

        if (reached) {
            this.targetIndex = -1;
        }

        return command;
    }
}
