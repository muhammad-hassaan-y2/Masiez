import { GPUDeviceContext } from '../gpu/Device';
import { FieldRenderer } from '../gpu/FieldRenderer';
import { SkyRenderer } from '../gpu/SkyRenderer';
import { TankPlacement, TankRenderer } from '../gpu/TankRenderer';
import { terrainHeight } from '../gameplay/Terrain';
import { Camera } from '../scene/Camera';
import { projectTankBoxes } from './Annotations';
import { createZip, ZipFile } from './zip';

export interface GeneratorOptions {
    trainFrames: number;
    validFrames: number;
    width: number;
    height: number;
    maxTanks: number;
    backgroundShare: number;
    jpegQuality: number;
    seed: number;
}

export interface GeneratorProgress {
    done: number;
    total: number;
    split: 'train' | 'valid';
}

export const GENERATOR_DEFAULTS: GeneratorOptions = {
    trainFrames: 300,
    validFrames: 60,
    width: 960,
    height: 540,
    maxTanks: 7,
    backgroundShare: 0.08,
    jpegQuality: 0.9,
    seed: 1,
};

const CATEGORY = { id: 1, name: 'tank', supercategory: 'vehicle' };

interface FrameRecord {
    fileName: string;
    boxes: { x: number; y: number; width: number; height: number }[];
}

function mulberry32(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

function randomPlacements(random: () => number, maxTanks: number, center: [number, number]): TankPlacement[] {
    const count = Math.floor(random() * (maxTanks + 1));
    const placements: TankPlacement[] = [];
    for (let i = 0; i < count; i++) {
        const angle = random() * Math.PI * 2;
        const distance = 10 + random() * 70;
        placements.push({
            x: center[0] + Math.cos(angle) * distance,
            z: center[1] + Math.sin(angle) * distance,
            yaw: random() * Math.PI * 2,
        });
    }
    return placements;
}

function buildCoco(split: string, width: number, height: number, frames: FrameRecord[]): Uint8Array<ArrayBuffer> {
    const images: object[] = [];
    const annotations: object[] = [];
    let annotationId = 1;

    frames.forEach((frame, index) => {
        const imageId = index + 1;
        images.push({ id: imageId, file_name: frame.fileName, width, height });
        for (const box of frame.boxes) {
            annotations.push({
                id: annotationId++,
                image_id: imageId,
                category_id: CATEGORY.id,
                bbox: [round2(box.x), round2(box.y), round2(box.width), round2(box.height)],
                area: round2(box.width * box.height),
                iscrowd: 0,
            });
        }
    });

    const payload = {
        info: { description: `masiez drone ${split} split`, date_created: new Date().toISOString() },
        licenses: [],
        images,
        annotations,
        categories: [CATEGORY],
    };
    return new TextEncoder().encode(JSON.stringify(payload));
}

class OffscreenTarget {
    private colorTexture: GPUTexture;
    private depthTexture: GPUTexture;
    private readback: GPUBuffer;
    private bytesPerRow: number;
    private canvas: HTMLCanvasElement;
    private context: CanvasRenderingContext2D;
    private imageData: ImageData;

    constructor(
        private device: GPUDevice,
        private format: GPUTextureFormat,
        private depthFormat: GPUTextureFormat,
        width: number,
        height: number,
    ) {
        this.bytesPerRow = this.rowBytes(width);
        this.canvas = document.createElement('canvas');
        this.canvas.width = width;
        this.canvas.height = height;
        this.context = this.canvas.getContext('2d')!;
        this.imageData = this.context.createImageData(width, height);

        this.colorTexture = device.createTexture({
            size: [width, height, 1],
            format,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        });
        this.depthTexture = device.createTexture({
            size: [width, height, 1],
            format: depthFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this.readback = device.createBuffer({
            size: this.bytesPerRow * height,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
    }

    private rowBytes(width: number): number {
        return Math.ceil((width * 4) / 256) * 256;
    }

    public get colorView(): GPUTextureView {
        return this.colorTexture.createView();
    }

    public get depthView(): GPUTextureView {
        return this.depthTexture.createView();
    }

    public get canvasElement(): HTMLCanvasElement {
        return this.canvas;
    }

    public async pixels(): Promise<ImageData> {
        const width = this.canvas.width;
        const height = this.canvas.height;
        const encoder = this.device.createCommandEncoder();
        encoder.copyTextureToBuffer(
            { texture: this.colorTexture },
            { buffer: this.readback, bytesPerRow: this.bytesPerRow },
            [width, height, 1],
        );
        this.device.queue.submit([encoder.finish()]);

        await this.readback.mapAsync(GPUMapMode.READ);
        const source = new Uint8Array(this.readback.getMappedRange());
        const pixels = this.imageData.data;
        const bgra = this.format === 'bgra8unorm';

        for (let y = 0; y < height; y++) {
            const rowStart = y * this.bytesPerRow;
            const outStart = y * width * 4;
            for (let x = 0; x < width; x++) {
                const s = rowStart + x * 4;
                const d = outStart + x * 4;
                pixels[d] = bgra ? source[s + 2] : source[s];
                pixels[d + 1] = source[s + 1];
                pixels[d + 2] = bgra ? source[s] : source[s + 2];
                pixels[d + 3] = 255;
            }
        }

        this.readback.unmap();
        this.context.putImageData(this.imageData, 0, 0);
        return this.imageData;
    }

    public destroy(): void {
        this.colorTexture.destroy();
        this.depthTexture.destroy();
        this.readback.destroy();
    }
}

export class DatasetGenerator {
    private camera = new Camera();
    private running = false;
    private tanks: TankRenderer | undefined;

    constructor(
        private ctx: GPUDeviceContext,
        private sky: SkyRenderer,
        private field: FieldRenderer,
    ) {}

    public get isRunning(): boolean {
        return this.running;
    }

    public async generate(
        options: Partial<GeneratorOptions> = {},
        onProgress: (progress: GeneratorProgress) => void = () => {},
    ): Promise<Blob> {
        const opts = { ...GENERATOR_DEFAULTS, ...options };
        const target = new OffscreenTarget(this.ctx.device, this.ctx.format, this.ctx.depthFormat, opts.width, opts.height);
        const files: ZipFile[] = [];
        const total = opts.trainFrames + opts.validFrames;
        let done = 0;
        this.running = true;

        if (!this.tanks) {
            this.tanks = new TankRenderer(this.ctx);
            await this.tanks.init([]);
        }
        const tanks = this.tanks;

        try {
            for (const split of ['train', 'valid'] as const) {
                const count = split === 'train' ? opts.trainFrames : opts.validFrames;
                const random = mulberry32(opts.seed + (split === 'train' ? 0 : 1013904223));
                const frames: FrameRecord[] = [];

                for (let index = 0; index < count; index++) {
                    const fileName = `${split}_${String(index).padStart(5, '0')}.jpg`;
                    frames.push(this.render(tanks, target, random, opts, fileName));
                    await target.pixels();
                    const blob = await new Promise<Blob | null>((resolve) =>
                        target.canvasElement.toBlob(resolve, 'image/jpeg', opts.jpegQuality),
                    );
                    if (!blob) throw new Error('JPEG encoding failed');
                    files.push({ name: `${split}/${fileName}`, data: new Uint8Array(await blob.arrayBuffer()) });
                    onProgress({ done: ++done, total, split });
                }

                files.push({
                    name: `${split}/_annotations.coco.json`,
                    data: buildCoco(split, opts.width, opts.height, frames),
                });
            }
        } finally {
            target.destroy();
            this.running = false;
        }

        return createZip(files);
    }

    private render(
        tanks: TankRenderer,
        target: OffscreenTarget,
        random: () => number,
        opts: GeneratorOptions,
        fileName: string,
    ): FrameRecord {
        const focus: [number, number] = [(random() - 0.5) * 280, (random() - 0.5) * 280];
        const placements = random() < opts.backgroundShare ? [] : randomPlacements(random, opts.maxTanks, focus);
        tanks.setPlacements(placements);

        const viewAngle = random() * Math.PI * 2;
        const distance = 25 + random() * 90;
        const altitude = 12 + random() * 50;
        const x = focus[0] + Math.cos(viewAngle) * distance;
        const z = focus[1] + Math.sin(viewAngle) * distance;
        const ground = terrainHeight(x, z);

        const heading = Math.atan2(-(focus[0] - x), focus[1] - z) + (random() - 0.5) * 1.4;
        const pitch = Math.min(0.7, Math.max(0.08, Math.atan2(altitude, distance)));
        this.camera.pitchRad = Math.min(0.75, Math.max(0.02, pitch + (random() - 0.5) * 0.5));
        this.camera.update(
            [x, ground + altitude, z],
            heading,
            opts.width / opts.height,
            ground,
            (random() - 0.5) * 16,
        );

        const encoder = this.ctx.device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: target.colorView,
                clearValue: { r: 0.72, g: 0.78, b: 0.8, a: 1.0 },
                loadOp: 'clear',
                storeOp: 'store',
            }],
            depthStencilAttachment: {
                view: target.depthView,
                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            },
        });

        this.sky.render(pass, this.camera);
        this.field.render(pass, this.camera);
        tanks.render(pass, this.camera);
        pass.end();
        this.ctx.device.queue.submit([encoder.finish()]);

        const boxes = projectTankBoxes(this.camera, tanks.getTargets(), opts.width, opts.height)
            .filter((box) => box.width >= 8 && box.height >= 8);

        return { fileName, boxes };
    }
}
