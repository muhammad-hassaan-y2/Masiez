import { getOrt } from './ortEnv';
import { AiAxes, OBS_NORMALIZE_SPEED, OBS_SIZE } from './types';

/**
 * PPO target-following policy running in-browser via ONNX Runtime Web.
 * Observation (7 floats): [dx, dy, w, h, vf, vr, vu]
 *   dx, dy — target box center offset from frame center (-0.5..0.5)
 *   w, h   — target box size normalized by frame size (0..1)
 *   vf/vr/vu — drone velocity in the camera frame, normalized by 20 m/s
 * Action (3 floats, tanh range): [forward, strafe, climb] velocity commands.
 */
export class PpoFollowPolicy {
    private session: any = null;
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
            this.ready = true;
            console.log(`[PPO] Loaded follow policy ${modelUrl}, inputs: ${this.session.inputNames}`);
            return true;
        } catch (err: any) {
            this.lastError = err?.message || String(err);
            console.warn('[PPO] Failed to load policy:', this.lastError);
            this.ready = false;
            return false;
        }
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

    public async act(dx: number, dy: number, w: number, h: number, vf: number, vr: number, vu: number): Promise<AiAxes> {
        if (!this.ready || !this.session) throw new Error('PPO policy not loaded');

        const obs = new Float32Array(OBS_SIZE);
        obs[0] = dx;
        obs[1] = dy;
        obs[2] = w;
        obs[3] = h;
        obs[4] = vf / OBS_NORMALIZE_SPEED;
        obs[5] = vr / OBS_NORMALIZE_SPEED;
        obs[6] = vu / OBS_NORMALIZE_SPEED;

        const ort = getOrt();
        const inputName = this.session.inputNames[0];
        const results = await this.session.run({
            [inputName]: new ort.Tensor('float32', obs, [1, OBS_SIZE]),
        });
        const actionTensor = results[this.session.outputNames[0]];
        return this.axesFromAction(Array.from(actionTensor.data as Float32Array).slice(0, 3));
    }
}
