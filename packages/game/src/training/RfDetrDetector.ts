export type DetectionSource = 'software' | 'rfdetr-femto';

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

const INPUT_SIZE = 384;

export class RfDetrDetector {
    public ready = false;
    public loading = false;
    public failed = false;
    public inferenceMs = 0;

    private worker: Worker | undefined;
    private canvas: HTMLCanvasElement;
    private context: CanvasRenderingContext2D;
    private pending = new Map<number, (boxes: ModelBox[]) => void>();
    private nextId = 1;
    private busy = false;

    constructor() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = INPUT_SIZE;
        this.canvas.height = INPUT_SIZE;
        const context = this.canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('2D canvas context unavailable');
        this.context = context;
    }

    public get isBusy(): boolean {
        return this.busy;
    }

    public init(): void {
        if (this.ready || this.loading) return;
        this.loading = true;
        this.failed = false;

        const worker = new Worker(new URL('./RfDetrWorker.ts', import.meta.url), { type: 'module' });
        this.worker = worker;
        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
            const message = event.data;
            if (message.type === 'ready') {
                this.ready = true;
                this.loading = false;
                return;
            }
            if (message.type === 'error') {
                this.failed = true;
                this.loading = false;
                console.error('RF-DETR load failed:', message.message);
                return;
            }
            this.inferenceMs = message.inferenceMs;
            const resolve = this.pending.get(message.id);
            this.pending.delete(message.id);
            if (resolve) resolve(message.boxes);
        };
        worker.onerror = (event) => {
            this.failed = true;
            this.loading = false;
            console.error('RF-DETR worker failed:', event.message);
            for (const resolve of this.pending.values()) resolve([]);
            this.pending.clear();
            this.busy = false;
        };
        worker.postMessage({ type: 'init' });
    }

    public async detect(source: HTMLCanvasElement): Promise<ModelBox[]> {
        if (!this.ready || !this.worker || this.busy) return [];
        this.busy = true;
        try {
            this.context.drawImage(source, 0, 0, INPUT_SIZE, INPUT_SIZE);
            const image = this.context.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
            const id = this.nextId++;
            const result = new Promise<ModelBox[]>((resolve) => this.pending.set(id, resolve));
            this.worker.postMessage({
                type: 'detect',
                id,
                width: source.width,
                height: source.height,
                buffer: image.data.buffer,
            }, [image.data.buffer]);
            return await result;
        } finally {
            this.busy = false;
        }
    }
}
