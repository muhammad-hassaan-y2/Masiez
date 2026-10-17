import { Camera } from '../scene/Camera';
import { PhysicsBridge } from '../wasm/PhysicsBridge';
import { EntityManager } from '../gameplay/EntityManager';
import { RtDetrDetector } from './RtDetrDetector';
import { PpoFollowPolicy } from './PpoFollowPolicy';
import { AiAxes, AiMode, AiStatusInfo, VisionDetection } from './types';

export interface AiFrameContext {
    canvas: HTMLCanvasElement;
    camera: Camera;
    physics: PhysicsBridge;
    entityManager: EntityManager;
    isCrashed: boolean;
    humanInputActive: boolean;
}

const DETECT_INTERVAL_MS = 140;
const FOLLOW_MIN_CONF = 0.35;
const HUMAN_RESUME_MS = 1200;

/**
 * In-browser autonomy stack: RT-DETR detections feed a PPO follow policy,
 * producing flight axes with no external inference server. When ONNX weights
 * are not present, a ground-truth projector and PD assist policy keep the
 * pipeline demoable (clearly reported via status).
 */
export class BrowserAIController {
    public readonly detector = new RtDetrDetector();
    public readonly policy = new PpoFollowPolicy();

    private mode: AiMode = 'OFF';
    private loadingPromise: Promise<void> | null = null;
    private busy = false;
    private lastInferStart = 0;
    private lastInferMs = 0;
    private detections: VisionDetection[] = [];
    private dims: { width: number; height: number } = { width: 1, height: 1 };
    private axes: AiAxes = { throttle: 0, pitch: 0, roll: 0, yaw: 0 };
    private following = false;
    private lastHumanInput = 0;

    public setMode(mode: AiMode): void {
        this.mode = mode;
        if (mode !== 'OFF' && !this.loadingPromise) {
            this.loadingPromise = Promise.all([
                this.detector.tryLoad(),
                this.policy.tryLoad(),
            ]).then(() => {});
        }
        if (mode === 'OFF') {
            this.detections = [];
            this.following = false;
            this.axes = { throttle: 0, pitch: 0, roll: 0, yaw: 0 };
        }
    }

    public getMode(): AiMode {
        return this.mode;
    }

    /** Flight axes when autonomy should steer, or null for human control. */
    public update(dt: number, ctx: AiFrameContext): AiAxes | null {
        if (this.mode === 'OFF' || ctx.isCrashed) {
            this.following = false;
            return null;
        }

        const now = performance.now();
        if (ctx.humanInputActive) {
            this.lastHumanInput = now;
            this.following = false;
            return null;
        }
        const humanJustReleased = now - this.lastHumanInput < HUMAN_RESUME_MS;

        if (!this.busy && now - this.lastInferStart >= DETECT_INTERVAL_MS) {
            this.lastInferStart = now;
            void this.runInference(ctx);
        }

        if (humanJustReleased) return null;

        if (this.mode === 'FOLLOW' && this.following) {
            return this.axes;
        }
        return null;
    }

    private async runInference(ctx: AiFrameContext): Promise<void> {
        this.busy = true;
        const started = performance.now();
        try {
            if (this.detector.ready) {
                this.detections = await this.detector.detect(ctx.canvas);
                this.dims = { width: ctx.canvas.width, height: ctx.canvas.height };
            } else {
                this.detections = this.groundTruthDetections(ctx);
                this.dims = { width: window.innerWidth, height: window.innerHeight };
            }

            const target = this.pickTarget();
            if (!target) {
                this.following = false;
                this.axes = { throttle: 0, pitch: 0, roll: 0, yaw: 0 };
                return;
            }

            const dx = (target.bbox[0] + target.bbox[2] / 2) / this.dims.width - 0.5;
            const dy = (target.bbox[1] + target.bbox[3] / 2) / this.dims.height - 0.5;
            const w = target.bbox[2] / this.dims.width;
            const h = target.bbox[3] / this.dims.height;

            const yaw = ctx.camera.mouseOrbitYaw;
            const vel = ctx.physics.getVelocity();
            const vf = vel[2] * Math.cos(yaw) - vel[0] * Math.sin(yaw);
            const vr = -vel[0] * Math.cos(yaw) - vel[2] * Math.sin(yaw);
            const vu = vel[1];

            let axes: AiAxes;
            if (this.policy.ready) {
                axes = await this.policy.act(dx, dy, w, h, vf, vr, vu);
                axes.yaw = this.yawAssist(dx);
            } else {
                axes = this.pdAssistAxes(dx, dy, w, h);
            }
            this.axes = axes;
            this.following = true;
        } catch (err: any) {
            console.warn('[BrowserAI] Inference tick failed:', err?.message || err);
            this.following = false;
        } finally {
            this.lastInferMs = performance.now() - started;
            this.busy = false;
        }
    }

    private pickTarget(): VisionDetection | null {
        let best: VisionDetection | null = null;
        let bestArea = 0;
        for (const det of this.detections) {
            if (det.confidence < FOLLOW_MIN_CONF) continue;
            const area = det.bbox[2] * det.bbox[3];
            if (area > bestArea) {
                bestArea = area;
                best = det;
            }
        }
        return best;
    }

    private yawAssist(dx: number): number {
        const mag = Math.abs(dx);
        if (mag < 0.22) return 0;
        return Math.max(-0.7, Math.min(0.7, dx * 1.6));
    }

    /** Deterministic stand-in for the PPO policy until ONNX weights are dropped in. */
    private pdAssistAxes(dx: number, dy: number, w: number, h: number): AiAxes {
        const clamp = (v: number) => Math.max(-1, Math.min(1, v));
        const aligned = Math.abs(dx) < 0.18;
        const closeRange = Math.max(w, h) > 0.32;
        return {
            pitch: aligned ? (closeRange ? 0.35 : 0.9) : 0.15,
            roll: clamp(dx * 2.4),
            throttle: clamp(-dy * 2.2),
            yaw: this.yawAssist(dx),
        };
    }

    /** Projects live hostile entities into pseudo-detections for pipeline bring-up. */
    private groundTruthDetections(ctx: AiFrameContext): VisionDetection[] {
        const out: VisionDetection[] = [];
        const sw = window.innerWidth;
        const sh = window.innerHeight;
        const camYaw = ctx.camera.mouseOrbitYaw;
        const drone = ctx.physics.getPosition();
        const rightX = -Math.cos(camYaw);
        const rightZ = -Math.sin(camYaw);

        for (const ent of ctx.entityManager.getAliveHostileTargets()) {
            const dxw = ent.pos[0] - drone[0];
            const dzw = ent.pos[2] - drone[2];
            const dist = Math.hypot(dxw, dzw);
            if (dist > 500) continue;

            const bottom = ctx.camera.projectToScreen([ent.pos[0], ent.pos[1] + 0.05, ent.pos[2]], sw, sh);
            const top = ctx.camera.projectToScreen([ent.pos[0], ent.pos[1] + ent.height, ent.pos[2]], sw, sh);
            const edge = ctx.camera.projectToScreen(
                [ent.pos[0] + rightX * ent.radius, ent.pos[1] + ent.height / 2, ent.pos[2] + rightZ * ent.radius],
                sw, sh
            );
            if (!bottom.visible || !top.visible || !edge.visible) continue;

            const y0 = Math.min(top.y, bottom.y);
            const y1 = Math.max(top.y, bottom.y);
            const halfW = Math.abs(edge.x - bottom.x);
            if (y1 - y0 < 3 || halfW < 1.5) continue;

            out.push({
                label: ent.roleName || ent.type,
                bbox: [bottom.x - halfW, y0, halfW * 2, y1 - y0],
                confidence: 1.0,
            });
        }
        return out;
    }

    public getDetectionsForHud(): { detections: VisionDetection[]; width: number; height: number } | null {
        if (this.mode === 'OFF') return null;
        return { detections: this.detections, width: this.dims.width, height: this.dims.height };
    }

    public getStatus(): AiStatusInfo {
        return {
            detector: this.detector.ready ? 'RT-DETR ONNX' : 'SIM PROJECTOR',
            policy: this.policy.ready ? 'PPO ONNX' : 'PD ASSIST',
            inferenceMs: this.lastInferMs,
            detections: this.detections.length,
            following: this.following,
            error: this.detector.lastError || this.policy.lastError,
        };
    }
}
