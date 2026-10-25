import { targetOverlap } from '../training/AnnotationOverlay';
import type { OverlayTarget } from '../training/AnnotationOverlay';

const YAW_GAIN = 2.6;
const CENTER_GAIN = 1.8;
const LOST_TIMEOUT_SEC = 1.2;
const MIN_OVERLAP = 0.2;
const RAM_WIDTH_FRACTION = 0.2;
const RAM_COMMIT_SEC = 2.5;
const RAM_THROTTLE = -0.35;

export interface ScreenCommand {
    throttle: number;
    pitch: number;
    roll: number;
    yaw: number;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export class ScreenAutopilot {
    private tankIndex = -1;
    private box?: OverlayTarget;
    private lostSec = 0;
    private commitSec = 0;
    private lastYaw = 0;

    public get isActive(): boolean {
        return this.box !== undefined;
    }

    public get activeTankIndex(): number {
        return this.tankIndex;
    }

    public get activeBox(): OverlayTarget | undefined {
        return this.box;
    }

    public setTarget(target: OverlayTarget): void {
        this.tankIndex = target.tankIndex !== undefined ? target.tankIndex : -1;
        this.box = target;
        this.lostSec = 0;
        this.commitSec = 0;
        this.lastYaw = 0;
    }

    public cancel(): void {
        this.tankIndex = -1;
        this.box = undefined;
        this.lostSec = 0;
        this.commitSec = 0;
        this.lastYaw = 0;
    }

    public update(
        targets: OverlayTarget[],
        viewWidth: number,
        viewHeight: number,
        deltaSec: number,
    ): ScreenCommand | undefined {
        const previous = this.box;
        if (!previous) return undefined;

        const tracked = this.track(previous, targets);
        if (!tracked) {
            this.lostSec += deltaSec;
            if (this.commitSec > 0) {
                this.commitSec = Math.max(0, this.commitSec - deltaSec);
                return {
                    throttle: RAM_THROTTLE,
                    pitch: 1,
                    roll: 0,
                    yaw: this.lastYaw,
                };
            }
            if (this.lostSec > LOST_TIMEOUT_SEC) this.cancel();
            return undefined;
        }

        this.box = tracked;
        this.lostSec = 0;
        if (tracked.width >= viewWidth * RAM_WIDTH_FRACTION) {
            this.commitSec = RAM_COMMIT_SEC;
        }

        const halfWidth = Math.max(1, viewWidth * 0.5);
        const halfHeight = Math.max(1, viewHeight * 0.5);
        const dx = (tracked.x + tracked.width * 0.5 - halfWidth) / halfWidth;
        const dy = (tracked.y + tracked.height * 0.5 - halfHeight) / halfHeight;
        const alignment = Math.max(0, 1 - Math.abs(dx));
        const yaw = clamp(dx * YAW_GAIN, -1, 1);
        this.lastYaw = yaw;

        return {
            throttle: clamp(-dy * CENTER_GAIN, -0.7, 1),
            pitch: alignment,
            roll: 0,
            yaw,
        };
    }

    private track(previous: OverlayTarget, targets: OverlayTarget[]): OverlayTarget | undefined {
        if (this.tankIndex >= 0) {
            return targets.find((target) => target.tankIndex === this.tankIndex);
        }
        let best: OverlayTarget | undefined;
        let bestOverlap = MIN_OVERLAP;
        for (const target of targets) {
            if (target.tankIndex !== undefined) continue;
            const overlap = targetOverlap(previous, target);
            if (overlap > bestOverlap) {
                best = target;
                bestOverlap = overlap;
            }
        }
        return best;
    }
}
