import { getOrt } from './ortEnv';
import { VisionDetection } from './types';

const INPUT_SIZE = 640;
const CONF_THRESHOLD = 0.35;

/**
 * RT-DETR object detector running fully in-browser via ONNX Runtime Web.
 * Expects the Ultralytics ONNX export: input [1,3,640,640] in 0..1,
 * output [1,300,6] with x1,y1,x2,y2,confidence,class in letterboxed pixel space.
 */
export class RtDetrDetector {
    private session: any = null;
    private labels: string[] = [];
    private letterboxCanvas: HTMLCanvasElement;
    private letterboxCtx: CanvasRenderingContext2D;

    public ready = false;
    public loadAttempted = false;
    public lastError: string | null = null;

    constructor() {
        this.letterboxCanvas = document.createElement('canvas');
        this.letterboxCanvas.width = INPUT_SIZE;
        this.letterboxCanvas.height = INPUT_SIZE;
        this.letterboxCtx = this.letterboxCanvas.getContext('2d', { willReadFrequently: true })!;
    }

    /** Returns true when the ONNX weights were found and loaded. */
    public async tryLoad(
        modelUrl = '/models/rt-detr.onnx',
        labelsUrl = '/models/rt-detr.labels.txt'
    ): Promise<boolean> {
        if (this.loadAttempted) return this.ready;
        this.loadAttempted = true;

        try {
            const probe = await fetch(modelUrl, { method: 'GET' });
            const ctype = probe.headers.get('content-type') || '';
            if (!probe.ok || ctype.includes('text/html')) {
                this.lastError = `Model not found at ${modelUrl} (train it in the Kaggle RT-DETR notebook)`;
                return false;
            }
            const modelBytes = new Uint8Array(await probe.arrayBuffer());

            const ort = getOrt();
            this.session = await ort.InferenceSession.create(modelBytes, {
                executionProviders: ['webgpu', 'wasm'],
                graphOptimizationLevel: 'all',
            });

            await this.loadLabels(labelsUrl, modelBytes);
            this.ready = true;
            console.log(`[RT-DETR] Loaded ${modelUrl} (${(modelBytes.length / 1e6).toFixed(1)} MB), inputs: ${this.session.inputNames}`);
            return true;
        } catch (err: any) {
            this.lastError = err?.message || String(err);
            console.warn('[RT-DETR] Failed to load model:', this.lastError);
            this.ready = false;
            return false;
        }
    }

    private async loadLabels(labelsUrl: string, _modelBytes: Uint8Array): Promise<void> {
        // 1. Sidecar label file: one class name per line, index == class id
        try {
            const res = await fetch(labelsUrl);
            if (res.ok) {
                const text = await res.text();
                this.labels = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
                if (this.labels.length > 0) return;
            }
        } catch { /* fall through */ }

        // 2. Ultralytics ONNX metadata json embedded in the model
        try {
            const decoder = new TextDecoder('utf-8', { fatal: false });
            const head = decoder.decode(_modelBytes.slice(0, 65536));
            const match = head.match(/"names"\s*:\s*\{([^}]*)\}/);
            if (match) {
                const pairs = match[1].match(/"?(\d+)"?\s*:\s*"([^"]+)"/g) || [];
                for (const pair of pairs) {
                    const m = pair.match(/"?(\d+)"?\s*:\s*"([^"]+)"/);
                    if (m) this.labels[Number(m[1])] = m[2];
                }
            }
        } catch { /* optional */ }
    }

    /**
     * Run one inference on the live render canvas. Bounding boxes are
     * returned in source-canvas pixel coordinates (letterbox undone).
     */
    public async detect(source: HTMLCanvasElement): Promise<VisionDetection[]> {
        if (!this.ready || !this.session) return [];

        const srcW = source.width;
        const srcH = source.height;
        const scale = Math.min(INPUT_SIZE / srcW, INPUT_SIZE / srcH);
        const scaledW = srcW * scale;
        const scaledH = srcH * scale;
        const padX = (INPUT_SIZE - scaledW) / 2;
        const padY = (INPUT_SIZE - scaledH) / 2;

        const ctx = this.letterboxCtx;
        ctx.fillStyle = '#727272';
        ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
        ctx.drawImage(source, padX, padY, scaledW, scaledH);
        const imageData = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data;

        const tensor = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
        const plane = INPUT_SIZE * INPUT_SIZE;
        for (let i = 0; i < plane; i++) {
            tensor[i] = imageData[i * 4] / 255;
            tensor[i + plane] = imageData[i * 4 + 1] / 255;
            tensor[i + plane * 2] = imageData[i * 4 + 2] / 255;
        }

        const ort = getOrt();
        const inputName = this.session.inputNames[0];
        const feeds: Record<string, any> = {
            [inputName]: new ort.Tensor('float32', tensor, [1, 3, INPUT_SIZE, INPUT_SIZE]),
        };
        const results = await this.session.run(feeds);
        const output = results[this.session.outputNames[0]];

        return this.postprocess(output, srcW, srcH, scale, padX, padY);
    }

    private postprocess(
        output: any,
        srcW: number,
        srcH: number,
        scale: number,
        padX: number,
        padY: number
    ): VisionDetection[] {
        const dims = output.dims as number[];
        const data = output.data as Float32Array;

        let count: number, stride: number, transpose = false;
        if (dims.length === 3 && dims[2] === 6) {
            count = dims[1]; stride = 6;
        } else if (dims.length === 3 && dims[1] === 6) {
            count = dims[2]; stride = 1; transpose = true;
        } else {
            console.warn('[RT-DETR] Unexpected output shape:', dims);
            return [];
        }

        const detections: VisionDetection[] = [];
        for (let i = 0; i < count; i++) {
            let x1: number, y1: number, x2: number, y2: number, conf: number, cls: number;
            if (transpose) {
                // Output laid out as [6, 300]: row r at offset r*count
                x1 = data[i]; y1 = data[count + i]; x2 = data[2 * count + i];
                y2 = data[3 * count + i]; conf = data[4 * count + i]; cls = data[5 * count + i];
            } else {
                const o = i * stride;
                x1 = data[o]; y1 = data[o + 1]; x2 = data[o + 2];
                y2 = data[o + 3]; conf = data[o + 4]; cls = data[o + 5];
            }

            if (conf < CONF_THRESHOLD) continue;

            const ux1 = Math.max(0, Math.min(srcW, (x1 - padX) / scale));
            const uy1 = Math.max(0, Math.min(srcH, (y1 - padY) / scale));
            const ux2 = Math.max(0, Math.min(srcW, (x2 - padX) / scale));
            const uy2 = Math.max(0, Math.min(srcH, (y2 - padY) / scale));
            const w = ux2 - ux1;
            const h = uy2 - uy1;
            if (w < 6 || h < 6) continue;

            const label = this.labels[Math.round(cls)] || (this.labels.length > 0 ? 'TARGET' : `CLASS ${Math.round(cls)}`);
            detections.push({ label, bbox: [ux1, uy1, w, h], confidence: conf });
        }

        detections.sort((a, b) => b.confidence - a.confidence);
        return detections.slice(0, 32);
    }
}
