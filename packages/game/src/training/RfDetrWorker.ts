import * as ort from 'onnxruntime-web/webgpu';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url';
import loaderUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs?url';
import type { ModelBox } from './RfDetrDetector';

interface InitMessage {
    type: 'init';
    url: string;
    size: number;
}

interface DetectMessage {
    type: 'detect';
    id: number;
    width: number;
    height: number;
    buffer: ArrayBuffer;
}

type Request = InitMessage | DetectMessage;

interface ReadyResponse {
    type: 'ready';
}

interface ErrorResponse {
    type: 'error';
    message: string;
}

interface ResultResponse {
    type: 'result';
    id: number;
    boxes: ModelBox[];
    inferenceMs: number;
}

type Response = ReadyResponse | ErrorResponse | ResultResponse;

const scope = self as unknown as {
    onmessage: ((event: MessageEvent<Request>) => void) | null;
    postMessage: (message: Response) => void;
};

const SCORE_THRESHOLD = 0.5;
const BACKGROUND_INDEX = 1;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let session: ort.InferenceSession | undefined;
let inputSize = 0;
let input = new Float32Array(0);

async function init(url: string, size: number): Promise<void> {
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = {
        mjs: loaderUrl,
        wasm: wasmUrl,
    };
    const response = await fetch(url);
    if (!response.ok) throw new Error(`model fetch failed: ${response.status}`);
    const model = new Uint8Array(await response.arrayBuffer());
    session = await ort.InferenceSession.create(model, {
        executionProviders: ['webgpu', 'wasm'],
        graphOptimizationLevel: 'all',
    });
    inputSize = size;
    input = new Float32Array(3 * inputSize * inputSize);
    scope.postMessage({ type: 'ready' });
}

async function detect(message: DetectMessage): Promise<void> {
    const started = performance.now();
    if (!session) {
        scope.postMessage({ type: 'result', id: message.id, boxes: [], inferenceMs: 0 });
        return;
    }

    const pixels = new Uint8ClampedArray(message.buffer);
    const plane = inputSize * inputSize;
    for (let index = 0, pixel = 0; pixel < plane; pixel++, index += 4) {
        input[pixel] = (pixels[index] / 255 - MEAN[0]) / STD[0];
        input[plane + pixel] = (pixels[index + 1] / 255 - MEAN[1]) / STD[1];
        input[plane * 2 + pixel] = (pixels[index + 2] / 255 - MEAN[2]) / STD[2];
    }

    const tensor = new ort.Tensor('float32', input, [1, 3, inputSize, inputSize]);
    const outputs = await session.run({ input: tensor });
    const dets = outputs.dets.data as Float32Array;
    const labels = outputs.labels.data as Float32Array;

    const boxes: ModelBox[] = [];
    for (let query = 0; query < labels.length / 2; query++) {
        const tankLogit = labels[query * 2];
        const backgroundLogit = labels[query * 2 + BACKGROUND_INDEX];
        if (tankLogit <= backgroundLogit) continue;
        const score = 1 / (1 + Math.exp(-tankLogit));
        if (score < SCORE_THRESHOLD) continue;

        const cx = dets[query * 4];
        const cy = dets[query * 4 + 1];
        const width = dets[query * 4 + 2];
        const height = dets[query * 4 + 3];
        const x0 = Math.max(0, (cx - width / 2) * message.width);
        const y0 = Math.max(0, (cy - height / 2) * message.height);
        const x1 = Math.min(message.width, (cx + width / 2) * message.width);
        const y1 = Math.min(message.height, (cy + height / 2) * message.height);
        if (x1 - x0 < 3 || y1 - y0 < 3) continue;

        boxes.push({ x: x0, y: y0, width: x1 - x0, height: y1 - y0, score });
    }

    scope.postMessage({ type: 'result', id: message.id, boxes, inferenceMs: performance.now() - started });
}

scope.onmessage = (event: MessageEvent<Request>) => {
    const message = event.data;
    if (message.type === 'init') {
        init(message.url, message.size).catch((error) => {
            scope.postMessage({ type: 'error', message: String(error) });
        });
        return;
    }
    detect(message).catch((error) => {
        scope.postMessage({ type: 'result', id: message.id, boxes: [], inferenceMs: 0 });
        console.error('RF-DETR inference failed:', error);
    });
};
