import { getOrt } from './ortEnv';
import {
    AiAxes,
    OBS_LEGACY_SIZE,
    OBS_NORMALIZE_ALT,
    OBS_NORMALIZE_RANGE,
    OBS_NORMALIZE_SPEED,
    OBS_SIZE,
} from './types';

/**
 * PPO target-following policy running in-browser via ONNX Runtime Web.
 * Observation (9 floats): [dx, dy, w, h, vf, vr, vu, rangeEst, altDelta]
 *   dx, dy     — target box center offset from frame center (-0.5..0.5)
 *   w, h       — target box size normalized by frame size (0..1)
 *   vf/vr/vu   — drone velocity in the camera frame, normalized by 20 m/s
 *   rangeEst   — ground range estimated from the apparent box height, / 100 m
 *   altDelta   — drone altitude above target center, / 25 m
 * Action (3 floats, tanh range): [forward, strafe, climb] velocity commands.
 *
 * The width is read from the exported model, so policies trained before the
 * range features existed still run with those channels zero-padded.
 */
export class PpoFollowPolicy {
    private session: any = null;
    public obsWidth = OBS_SIZE;
    public ready = false;
    public loadAttempted = false;
    public lastError: string | null = null;

    /** Returns true when the exported PPO ONNX policy was found and loaded. */
    public async tryLoad(modelUrl = '/models/ppo-follow.onnx'): Promise<boolean> {
        if (this.loadAttempted) return this.ready;
        this.loadAttempted = true;

        try {
            const probe = await fetch(modelUrl);
            const ctype = probe.headers.get('content-type') || '';
            if (!probe.ok || ctype.includes('text/html')) {
                this.lastError = `Policy not found at ${modelUrl} (train it in the Kaggle PPO notebook)`;
                return false;
            }
            const modelBytes = new Uint8Array(await probe.arrayBuffer());

            const ort = getOrt();
            this.session = await ort.InferenceSession.create(modelBytes, {
                executionProviders: ['wasm'],
                graphOptimizationLevel: 'all',
            });
            this.obsWidth = await this.resolveInputWidth();
            this.ready = true;
            console.log(`[PPO] Loaded follow policy ${modelUrl}, observation width ${this.obsWidth}`);
            return true;
        } catch (err: any) {
            this.lastError = err?.message || String(err);
            console.warn('[PPO] Failed to load policy:', this.lastError);
            this.ready = false;
            return false;
        }
    }

    /** Static export width of the first model input, when the runtime reports it. */
    private readInputWidth(): number | null {
        const meta = this.session?.inputMetadata?.[0] || this.session?.inputs?.[0];
        const dims = meta?.dimensions || meta?.shape;
        const last = Array.isArray(dims) ? dims[dims.length - 1] : undefined;
        return typeof last === 'number' && last > 0 ? last : null;
    }

    /**
     * Runtimes differ in whether they expose input shapes before a run, so the
     * width is confirmed with a throwaway inference rather than guessed.
     */
    private async resolveInputWidth(): Promise<number> {
        const declared = this.readInputWidth();
        if (declared === OBS_SIZE || declared === OBS_LEGACY_SIZE) return declared;

        const ort = getOrt();
        const inputName = this.session.inputNames[0];
        for (const width of [OBS_SIZE, OBS_LEGACY_SIZE]) {
            try {
                await this.session.run({ [inputName]: new ort.Tensor('float32', new Float32Array(width), [1, width]) });
                return width;
            } catch {
                // wrong width for this export — try the next layout
            }
        }
        return declared ?? OBS_SIZE;
    }

    /** Maps the action triplet onto the drone's manual flight axes. */
    public axesFromAction(action: number[]): AiAxes {
        const clamp = (v: number) => Math.max(-1, Math.min(1, v));
        return {
            pitch: clamp(action[0]),
            roll: clamp(action[1]),
            throttle: clamp(action[2]),
            yaw: 0,
        };
    }

    public async act(
        dx: number,
        dy: number,
        w: number,
        h: number,
        vf: number,
        vr: number,
        vu: number,
        rangeEstM: number,
        altDeltaM: number
    ): Promise<AiAxes> {
        if (!this.ready || !this.session) throw new Error('PPO policy not loaded');

        const obs = new Float32Array(this.obsWidth);
        obs[0] = dx;
        obs[1] = dy;
        obs[2] = w;
        obs[3] = h;
        obs[4] = vf / OBS_NORMALIZE_SPEED;
        obs[5] = vr / OBS_NORMALIZE_SPEED;
        obs[6] = vu / OBS_NORMALIZE_SPEED;
        if (this.obsWidth > OBS_LEGACY_SIZE) {
            obs[7] = Math.max(0, Math.min(2, rangeEstM / OBS_NORMALIZE_RANGE));
            obs[8] = Math.max(-1, Math.min(1, altDeltaM / OBS_NORMALIZE_ALT));
        }

        const ort = getOrt();
        const inputName = this.session.inputNames[0];
        const results = await this.session.run({
            [inputName]: new ort.Tensor('float32', obs, [1, this.obsWidth]),
        });
        const actionTensor = results[this.session.outputNames[0]];
        return this.axesFromAction(Array.from(actionTensor.data as Float32Array).slice(0, 3));
    }
}
