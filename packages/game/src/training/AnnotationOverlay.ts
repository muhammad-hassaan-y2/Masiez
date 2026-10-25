import { Camera } from '../scene/Camera';
import { TankTarget } from '../gpu/TankRenderer';
import { terrainHeight } from '../gameplay/Terrain';
import { projectTankBoxes } from './Annotations';
import type { DetectionSource, ModelBox } from './RfDetrDetector';

const MODEL_BOX_TTL_MS = 1500;
const TANK_CENTER_HEIGHT = 1.0;

export interface OverlayTarget {
    x: number;
    y: number;
    width: number;
    height: number;
    tankIndex?: number;
}

export interface ModelObservation {
    capturedAt: number;
    heading: number;
    pitch: number;
    position: [number, number, number];
    viewWidth: number;
    viewHeight: number;
    fovRad: number;
}

function projectPoint(
    matrix: Float32Array,
    point: [number, number, number],
    viewWidth: number,
    viewHeight: number,
): [number, number] | undefined {
    const x = matrix[0] * point[0] + matrix[4] * point[1] + matrix[8] * point[2] + matrix[12];
    const y = matrix[1] * point[0] + matrix[5] * point[1] + matrix[9] * point[2] + matrix[13];
    const w = matrix[3] * point[0] + matrix[7] * point[1] + matrix[11] * point[2] + matrix[15];
    if (w <= 0.05) return undefined;
    return [(x / w * 0.5 + 0.5) * viewWidth, (0.5 - y / w * 0.5) * viewHeight];
}

export function projectWorldPoint(
    matrix: Float32Array,
    point: [number, number, number],
    viewWidth: number,
    viewHeight: number,
): [number, number] | undefined {
    return projectPoint(matrix, point, viewWidth, viewHeight);
}

function distance(a: [number, number, number], b: [number, number, number]): number {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function groundTarget(box: ModelBox, observation: ModelObservation): [number, number, number] | undefined {
    const tanHalfFov = Math.tan(observation.fovRad * 0.5);
    const aspect = observation.viewWidth / observation.viewHeight;
    const ndcX = ((box.x + box.width * 0.5) / observation.viewWidth) * 2 - 1;
    const ndcY = 1 - ((box.y + box.height) / observation.viewHeight) * 2;
    const cameraX = ndcX * aspect * tanHalfFov;
    const cameraY = ndcY * tanHalfFov;

    const cosPitch = Math.cos(observation.pitch);
    const sinPitch = Math.sin(observation.pitch);
    const sinHeading = Math.sin(observation.heading);
    const cosHeading = Math.cos(observation.heading);
    const forward: [number, number, number] = [-sinHeading * cosPitch, -sinPitch, cosHeading * cosPitch];
    const right: [number, number, number] = [-cosHeading, 0, -sinHeading];
    const up: [number, number, number] = [
        -forward[1] * right[2],
        -forward[2] * right[0] + forward[0] * right[2],
        forward[1] * right[0],
    ];

    const dirX = forward[0] + right[0] * cameraX + up[0] * cameraY;
    const dirY = forward[1] + right[1] * cameraX + up[1] * cameraY;
    const dirZ = forward[2] + right[2] * cameraX + up[2] * cameraY;
    if (dirY >= -0.0001) return undefined;

    let groundY = 0;
    let targetX = 0;
    let targetZ = 0;
    for (let i = 0; i < 3; i++) {
        const rayLength = (groundY - observation.position[1]) / dirY;
        if (rayLength <= 0) return undefined;
        targetX = observation.position[0] + dirX * rayLength;
        targetZ = observation.position[2] + dirZ * rayLength;
        groundY = terrainHeight(targetX, targetZ);
    }
    return [targetX, groundY + TANK_CENTER_HEIGHT, targetZ];
}

export function deadReckonBox(
    box: ModelBox,
    observation: ModelObservation,
    viewProjMatrix: Float32Array,
    cameraPosition: [number, number, number],
    viewWidth: number,
    viewHeight: number,
): OverlayTarget | undefined {
    const target = groundTarget(box, observation);
    if (!target) return undefined;
    const screen = projectPoint(viewProjMatrix, target, viewWidth, viewHeight);
    if (!screen) return undefined;
    const scale = distance(observation.position, target) / Math.max(1, distance(cameraPosition, target));
    const width = box.width * scale;
    const height = box.height * scale;
    return {
        x: screen[0] - width * 0.5,
        y: screen[1] - height * 0.5,
        width,
        height,
    };
}

export function targetOverlap(a: OverlayTarget, b: OverlayTarget): number {
    const x0 = Math.max(a.x, b.x);
    const y0 = Math.max(a.y, b.y);
    const x1 = Math.min(a.x + a.width, b.x + b.width);
    const y1 = Math.min(a.y + a.height, b.y + b.height);
    const intersection = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
    if (intersection <= 0) return 0;
    const union = a.width * a.height + b.width * b.height - intersection;
    return union > 0 ? intersection / union : 0;
}

export class AnnotationOverlay {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private targetMode = false;
    private source: DetectionSource = 'software';
    private selectedTank = -1;
    private selectedBox?: OverlayTarget;
    private pointerX = 0;
    private pointerY = 0;
    private pointerActive = false;
    private boxes: OverlayTarget[] = [];
    private softwareBoxes: OverlayTarget[] = [];
    private modelBoxes: ModelBox[] = [];
    private modelObservation?: ModelObservation;
    private dpr = 1;
    private viewWidth = 0;
    private viewHeight = 0;

    constructor() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'annotation-overlay';
        this.canvas.style.cssText = `
            position:absolute;inset:0;width:100%;height:100%;
            pointer-events:none;z-index:5;
        `;
        document.body.appendChild(this.canvas);

        const ctx = this.canvas.getContext('2d');
        if (!ctx) throw new Error('2D canvas context unavailable');
        this.ctx = ctx;

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    public setTargetMode(active: boolean): void {
        this.targetMode = active;
    }

    public setPointer(x: number, y: number, active: boolean): void {
        this.pointerX = x;
        this.pointerY = y;
        this.pointerActive = active;
    }

    public setSelection(tankIndex: number, box?: OverlayTarget): void {
        this.selectedTank = tankIndex;
        this.selectedBox = box;
    }

    public getTargets(): OverlayTarget[] {
        return this.boxes;
    }

    public setDetectionSource(source: DetectionSource): void {
        if (this.source === source) return;
        this.source = source;
        this.boxes = [];
        this.modelBoxes = [];
        this.modelObservation = undefined;
    }

    public setModelBoxes(boxes: ModelBox[], observation: ModelObservation): void {
        this.modelBoxes = boxes;
        this.modelObservation = observation;
    }

    public hitTest(x: number, y: number): OverlayTarget | undefined {
        let match: OverlayTarget | undefined;
        for (const target of this.boxes) {
            const inside = x >= target.x && x <= target.x + target.width && y >= target.y && y <= target.y + target.height;
            if (!inside) continue;
            if (!match || target.width * target.height < match.width * match.height) {
                match = target;
            }
        }
        return match;
    }

    private resize(): void {
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.viewWidth = Math.max(1, window.innerWidth);
        this.viewHeight = Math.max(1, window.innerHeight);
        this.canvas.width = Math.max(1, Math.round(this.viewWidth * this.dpr));
        this.canvas.height = Math.max(1, Math.round(this.viewHeight * this.dpr));
    }

    public draw(camera: Camera, targets: TankTarget[]): void {
        const ctx = this.ctx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.boxes = [];
        this.softwareBoxes = [];
        if (!this.targetMode) return;

        this.softwareBoxes = projectTankBoxes(camera, targets, this.viewWidth, this.viewHeight)
            .map((box) => ({ x: box.x, y: box.y, width: box.width, height: box.height, tankIndex: box.tankIndex }));

        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.font = '600 11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
        ctx.textBaseline = 'top';

        if (this.source === 'software') {
            this.drawSoftware();
        } else {
            this.drawModel(camera);
        }
    }

    private drawSoftware(): void {
        this.boxes = this.softwareBoxes;
        const hovered = this.pointerActive ? this.hitTest(this.pointerX, this.pointerY) : undefined;

        for (const box of this.boxes) {
            const selected = box.tankIndex === this.selectedTank;
            const label = selected
                ? `LOCKED ${String(box.tankIndex).padStart(2, '0')}`
                : `TANK ${String(box.tankIndex).padStart(2, '0')}`;
            this.paintBox(box, label, selected, box === hovered);
        }
    }

    private drawModel(camera: Camera): void {
        if (this.modelObservation && performance.now() - this.modelObservation.capturedAt > MODEL_BOX_TTL_MS) {
            return;
        }
        this.boxes = this.modelBoxes.map((box) => this.deadReckon(box, camera));
        for (let i = 0; i < this.modelBoxes.length; i++) {
            const modelBox = this.modelBoxes[i];
            const selected = (this.selectedTank >= 0 && this.boxes[i].tankIndex === this.selectedTank) ||
                (this.selectedBox !== undefined && targetOverlap(this.boxes[i], this.selectedBox) > 0.5);
            this.paintBox(this.boxes[i], `TANK ${modelBox.score.toFixed(2)}`, selected, false);
        }
    }

    private deadReckon(box: ModelBox, camera: Camera): OverlayTarget {
        const observation = this.modelObservation;
        if (!observation) {
            return { x: box.x, y: box.y, width: box.width, height: box.height };
        }
        const corrected = deadReckonBox(box, observation, camera.viewProjMatrix, camera.position, this.viewWidth, this.viewHeight);
        if (!corrected) {
            return { x: box.x, y: box.y, width: box.width, height: box.height };
        }
        corrected.tankIndex = this.matchTank(corrected);
        return corrected;
    }

    private matchTank(box: OverlayTarget): number | undefined {
        let tankIndex: number | undefined;
        let bestOverlap = 0.3;
        for (const candidate of this.softwareBoxes) {
            if (candidate.tankIndex === undefined) continue;
            const overlap = targetOverlap(box, candidate);
            if (overlap > bestOverlap) {
                bestOverlap = overlap;
                tankIndex = candidate.tankIndex;
            }
        }
        return tankIndex;
    }

    private paintBox(box: { x: number; y: number; width: number; height: number }, label: string, selected: boolean, hovered: boolean): void {
        const ctx = this.ctx;
        ctx.lineWidth = selected || hovered ? 2.5 : 1.5;
        ctx.strokeStyle = selected
            ? 'rgba(255,120,90,1)'
            : 'rgba(255,196,110,0.95)';
        ctx.strokeRect(box.x, box.y, box.width, box.height);

        const labelWidth = ctx.measureText(label).width + 8;
        const labelY = box.y >= 17 ? box.y - 17 : box.y;
        ctx.fillStyle = selected ? 'rgba(60,16,10,0.85)' : 'rgba(6,18,12,0.78)';
        ctx.fillRect(box.x, labelY, labelWidth, 16);
        ctx.fillStyle = selected ? 'rgba(255,170,140,1)' : 'rgba(255,214,150,1)';
        ctx.fillText(label, box.x + 4, labelY + 3);
    }
}
