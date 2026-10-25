export type ModelId = 'rfdetr-femto' | 'rfdetr-atto';
export type DetectionSource = 'software' | ModelId;

export interface ModelBox {
    x: number;
    y: number;
    width: number;
    height: number;
    score: number;
}

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

type WorkerResponse = ReadyResponse | ErrorResponse | ResultResponse;

interface ModelState {
    worker?: Worker;
    ready: boolean;
    loading: boolean;
    failed: boolean;
    inferenceMs: number;
    pending: Map<number, (boxes: ModelBox[]) => void>;
    nextId: number;
    busy: boolean;
}

const MODEL_URLS: Record<ModelId, string> = {
    'rfdetr-femto': '/models/rfdetr-femto.onnx',
    'rfdetr-atto': '/models/rfdetr-atto.onnx',
};

const MODEL_INPUT_SIZES: Record<ModelId, number> = {
    'rfdetr-femto': 384,
    'rfdetr-atto': 380,
};

export class RfDetrDetector {
    private canvas = document.createElement('canvas');
    private context: CanvasRenderingContext2D;
    private models = new Map<ModelId, ModelState>();
    private active: ModelId = 'rfdetr-femto';

    constructor() {
        const context = this.canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('2D canvas context unavailable');
        this.context = context;
    }

    public get ready(): boolean {
        return this.state().ready;
    }

    public get loading(): boolean {
        return this.state().loading;
    }

    public get failed(): boolean {
        return this.state().failed;
    }

    public get inferenceMs(): number {
        return this.state().inferenceMs;
    }

    public get isBusy(): boolean {
        return this.state().busy;
    }

    public load(model: ModelId): void {
        this.active = model;
        const state = this.state();
        if (state.ready || state.loading) return;
        state.loading = true;
        state.failed = false;

        const worker = new Worker(new URL('./RfDetrWorker.ts', import.meta.url), { type: 'module' });
        state.worker = worker;
        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
            const message = event.data;
            if (message.type === 'ready') {
                state.ready = true;
                state.loading = false;
                return;
            }
            if (message.type === 'error') {
                state.failed = true;
                state.loading = false;
                console.error(`${model} load failed:`, message.message);
                return;
            }
            state.inferenceMs = message.inferenceMs;
            const resolve = state.pending.get(message.id);
            state.pending.delete(message.id);
            if (resolve) resolve(message.boxes);
        };
        worker.onerror = (event) => {
            state.failed = true;
            state.loading = false;
            state.worker = undefined;
            console.error(`${model} worker failed:`, event.message);
            for (const resolve of state.pending.values()) resolve([]);
            state.pending.clear();
            state.busy = false;
        };
        worker.postMessage({ type: 'init', url: MODEL_URLS[model], size: MODEL_INPUT_SIZES[model] });
    }

    public async detect(source: HTMLCanvasElement): Promise<ModelBox[]> {
        const state = this.state();
        const worker = state.worker;
        if (!state.ready || !worker || state.busy) return [];
        state.busy = true;
        try {
            const size = MODEL_INPUT_SIZES[this.active];
            if (this.canvas.width !== size) {
                this.canvas.width = size;
                this.canvas.height = size;
            }
            this.context.drawImage(source, 0, 0, size, size);
            const image = this.context.getImageData(0, 0, size, size);
            const id = state.nextId++;
            const result = new Promise<ModelBox[]>((resolve) => state.pending.set(id, resolve));
            worker.postMessage({
                type: 'detect',
                id,
                width: source.clientWidth,
                height: source.clientHeight,
                buffer: image.data.buffer,
            }, [image.data.buffer]);
            return await result;
        } finally {
            state.busy = false;
        }
    }

    private state(): ModelState {
        let state = this.models.get(this.active);
        if (!state) {
            state = {
                ready: false,
                loading: false,
                failed: false,
                inferenceMs: 0,
                pending: new Map(),
                nextId: 1,
                busy: false,
            };
            this.models.set(this.active, state);
        }
        return state;
    }
}
